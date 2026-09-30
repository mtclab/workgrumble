import * as THREE from 'three';
import { sfx } from './audio';
import { castShadows, setBlobShadows } from './characters';
import { Pipeline } from './graphics';
import { Particles } from './particles';
import { caffeineBand, CAFFEINE_EFFECTS, effectiveCaffeine } from './caffeine';
import {
  fire,
  hurtPlayer,
  playerAttackInput,
  resolveActor,
  updateFx,
  updateHazards,
  updatePickups,
  updateProjectiles,
  type FxMesh,
  type Floater,
  type Hazard,
  type Pickup,
  type Projectile,
  floatText,
  spawnHazard,
  spawnTelegraph,
} from './combat';
import { Compass, type CompassMarker } from './compass';
import { TICKETS } from './content/tickets';
import { breach, type FixEntry } from './desk';
import { type DialogueNode, type DialogueOption, DialogueUI, LockpickUI, said } from './dialogue';
import { disposeTree } from './dispose';
import {
  type Actor,
  type ActorKind,
  createActor,
  disposeActor,
  ELITE_AFFIXES,
  type EliteAffix,
  type GameCtx,
  type HazardKind,
  type ProjectileKind,
  type ProjectileSpec,
  say,
  setMarker,
  type SpawnOpts,
  type TelegraphSpec,
  updateActor,
  updateAuras,
} from './entities';
import { Hud, type HudFrame } from './hud';
import { Input } from './input';
import { findPrompt, interact } from './interact';
import { flowField, generateLevel, type Interactable, isSolidAt, type Level, lineOfSight, TILE, toCell, wallBetween } from './level';
import { EXTRA_BASE, lastStand, redropBossLoot } from './combat';
import { itemById } from './items';
import { spellById } from './magic';
import { FishingUI } from './minigames';
import { generateMokki, MOKKI_SUN } from './mokki';
import { type OsHost, Os } from './os';
import { endOnCall, type PagerHost, pagerHud, startOnCall, tickPager } from './pager';
import { Player } from './player';
import {
  evidenceHeld,
  maybeStaff,
  placeQuestContent,
  pushBack,
  questEvent,
  questLines,
  questMarkers,
  scheduleStaffing,
  settleWeek,
  startStage,
  tickQuests,
} from './questing';
import { type QuestDef, type QuestEvent, type QuestHost, type QuestState } from './quests';
import { browserStorage, takeWhatsNew } from './releases';
import { fx, Rng } from './rng';
import {
  type ArchPath,
  type Attribute,
  type Band,
  BAND_EFFECTS,
  bandFor,
  checkChance,
  difficultyFor,
  type Domain,
  endingFor,
  type Faction,
  FACTION_INFO,
  promille,
  RUNG_COUNT,
  salaryFor,
  type Skill,
  SKILL_INFO,
  titleFor,
  type Track,
  WORKPLACES,
} from './rpg';
import { latestSlot, readSlot, type SlotId, writeSlot } from './saves';
import { type Action, loadSettings, type Settings, saveSettings } from './settings';
import * as screens from './screens';
import { castSpell, cycleSpell, domainAbility, domainCooldown, spellLabel } from './spells';
import {
  adjustStanding,
  applyLevelUp,
  type CharacterSetup,
  clearLegacy,
  derive,
  type Derived,
  freshFloorState,
  freshWeekend,
  levelUpReady,
  loadLegacy,
  newSave,
  normalizeSave,
  perk,
  type QueuedTicket,
  raiseSkill,
  type SaveState,
  skill,
  useSkill,
} from './state';
import { disciplinary, levelUpNode, performanceReview, type StoryHost, storyNpcFor } from './story';
import { THEMES } from './textures';
import { overflowDecision, type LoylySource, SUO_LINES } from './suo';
import { CROSSING_STOP, Vision, type VisionEnd } from './vision';
import { ACHIEVEMENTS, TIPS } from './upgrades';
import * as host from './hosts';
import { tickCaffeine, tickVices } from './vices';
import {
  dropMentoring,
  helperMult,
  initTeammate,
  restTeam,
  scheduleMentoring,
  teamNote,
  tickTeam,
  tooTired,
  treatOptions,
} from './teamwork';
import { chargeShown, dropHold, TAP_TIME } from './windup';

export type Screen = 'title' | 'chargen' | 'play' | 'os' | 'dialogue' | 'paused' | 'dead' | 'ending' | 'transition' | 'minigame';

export type PromptTarget = { kind: 'interact'; it: Interactable } | { kind: 'actor'; a: Actor } | null;

/** The last floor of the story. Past it, the game goes on as Overtime. */
export const FINAL_FLOOR = 4;

/** Seconds of LMB hold that make a melee swing a power attack. */
export const POWER_TIME = 0.65;

/** How far away people are still drawn and simulated at leisure, in metres. */
const ACTOR_RANGE = 45;

/** Half a person's width, for the sight lines past a door frame. */
const SHOULDER = 0.45;

export class Game implements GameCtx, OsHost, StoryHost, QuestHost, PagerHost {
  readonly renderer: THREE.WebGLRenderer;
  readonly pipeline: Pipeline;
  readonly particles: Particles;
  readonly scene = new THREE.Scene();
  /** 0..1 red flash on the mood pass when you get hurt. */
  hurtFlash = 0;
  private dustIn = 0;
  private readonly moodTint = new THREE.Color(1, 1, 1);
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly hud: Hud;
  readonly os: Os;
  readonly dialogue: DialogueUI;
  readonly lockpick: LockpickUI;
  readonly fishing: FishingUI;
  readonly compass: Compass;
  readonly player: Player;
  readonly overlay: HTMLDivElement;
  readonly mount: HTMLElement;
  readonly lights: THREE.PointLight[] = [];
  /** The light the camera carries (in a vision, the one low amber light left). */
  readonly carry: THREE.PointLight;
  private readonly camPos = new THREE.Vector3();
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  save: SaveState;
  settings: Settings;
  level!: Level;
  actors: Actor[] = [];
  projectiles: Projectile[] = [];
  pickups: Pickup[] = [];
  fxMeshes: FxMesh[] = [];
  floaters: Floater[] = [];
  hazards: Hazard[] = [];
  field: Int16Array = new Int16Array(0);
  fieldIn = 0;
  seenIn = 0;
  lightIn = 0;
  saveIn = 60;
  time = 0;
  screen: Screen = 'title';
  // Combat.
  attackCd = 0;
  shoveCd = 0;
  /** Seconds LMB has been held on this press (melee: the swing comes on the release). */
  chargeT = 0;
  charging = false;
  /** A quick swing let go while the tool was still recovering: it goes as soon as it can. */
  swingQueued = false;
  /** Holding the trigger on an empty tool (the crosshair changes while you do). */
  dryFire = false;
  blocking = false;
  /** Seconds RMB has been held: a tap shoves, a hold blocks, an early hold parries. */
  rmbT = 0;
  hitStop = 0;
  /** Seconds of a chatbot's slow. */
  slowT = 0;
  rootT = 0;
  /** Meeting invites bounce off until this time: no chains of back-to-back meetings. */
  rootImmuneUntil = 0;
  rootReason = '';
  sisuT = 0;
  invisT = 0;
  saunaT = 0;
  abilityCd = 0;
  auraSlow = 0;
  hazardSlow = 0;
  athleticsT = 0;
  stealthT = 0;
  stumbleT = 3;
  withdrawalT = 0;
  jitterT = 4;
  caughtCd = 0;
  stillT = 0;
  faceMood: 'normal' | 'hurt' | 'grin' | 'left' | 'right' = 'normal';
  faceT = 0;
  shakeAmt = 0;
  boss: Actor | null = null;
  bossMult = 1;
  elevatorOpen = false;
  derivedCache: Derived;
  currentTerminal: Interactable | null = null;
  slackedTerminals = new Set<number>();
  caughtPending = false;
  fixCache = new WeakMap<QueuedTicket, FixEntry>();
  prompt = '';
  promptTarget: PromptTarget = null;
  stepIn = 0;
  last = performance.now();
  readonly projGeo = new Map<ProjectileKind, [THREE.BufferGeometry, THREE.Material]>();
  levelRng = new Rng(1);
  lootRng = new Rng(2);
  mark: THREE.Vector3 | null = null;
  history: { x: number; z: number; sanity: number }[] = [];
  historyIn = 0;
  afterDialogue: (() => void) | null = null;
  /** Locker id → the quest item waiting inside it. */
  readonly lockerItems = new Map<number, string>();
  markers: CompassMarker[] = [];
  markersIn = 0;
  /** Seconds until someone tries to staff you on something. */
  staffIn = 0;
  staffFirst = false;
  /** A staffing call waiting for a quiet moment to ring. */
  pendingStaff: { def: QuestDef; by: string; wait: number } | null = null;
  /** Computers you have logged on to on this floor. */
  readonly loggedOn = new Set<number>();
  /** Seconds until somebody on the team gets stuck (seniors only). */
  mentorIn = 0;
  /** A teammate on their way to ask you for help. */
  mentorAsk: { actor: Actor; def: QuestDef; wait: number } | null = null;
  /** Under the steam (SUO), or null. While it lasts nothing is saved. */
  vision: Vision | null = null;
  /** An overflow that earned a vision, waiting for play to resume (after a level-up dialogue, the backpack). */
  visionDue = false;
  /**
   * How the world differed after the last vision from before it: one line per
   * difference, empty when the restore was exact. Null before the first.
   */
  lastVisionDiff: string[] | null = null;
  /** Reused by `walk`: no allocation per frame. */
  private readonly moveDir = new THREE.Vector2();

  constructor(mount: HTMLElement) {
    this.mount = mount;
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({
      // Every frame is drawn offscreen by the pass chain and only a full-screen
      // quad reaches the canvas, so canvas MSAA would smooth nothing; the
      // SMAA/FXAA passes are the anti-aliasing.
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    mount.append(this.renderer.domElement);
    this.renderer.domElement.className = 'game-canvas';
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 160);
    this.scene.add(this.camera);
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.pipeline = new Pipeline(this.renderer, this.scene, this.camera);
    this.particles = new Particles(this.scene);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc890, 0);
    this.sun.position.set(-30, 40, 60);
    // The sun's shadow covers the whole mökki plot.
    const sc = this.sun.shadow.camera;
    sc.left = -50;
    sc.right = 50;
    sc.top = 50;
    sc.bottom = -50;
    sc.near = 1;
    sc.far = 160;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffffff, 14, 16, 1.4);
      l.shadow.mapSize.set(512, 512);
      l.shadow.bias = -0.002;
      l.shadow.normalBias = 0.05;
      l.shadow.camera.near = 0.2;
      l.shadow.camera.far = 16;
      this.scene.add(l);
      this.lights.push(l);
    }
    this.carry = new THREE.PointLight(0xfff0dd, 4, 8, 1.5);
    this.carry.position.set(0, 0.3, 0);
    this.camera.add(this.carry);

    this.input = new Input(this.renderer.domElement);
    this.hud = new Hud(mount);
    this.compass = new Compass(mount);
    this.os = new Os(mount, this);
    this.dialogue = new DialogueUI(mount);
    this.lockpick = new LockpickUI(mount);
    this.fishing = new FishingUI(mount);
    this.player = new Player(this.camera, this.scene);
    castShadows(this.player.model);
    this.overlay = document.createElement('div');
    this.overlay.className = 'screen';
    mount.append(this.overlay);

    this.save = this.loadLatest() ?? newSave(Date.now() >>> 0);
    this.derivedCache = derive(this.save);
    this.applySettings();

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === null) this.dropMeleeHold();
      if (document.pointerLockElement === null && this.screen === 'play') screens.showPause(this);
      // A lock request that lands after a dialogue or menu opened would trap
      // the cursor behind it: give it straight back.
      if (document.pointerLockElement !== null && this.screen !== 'play') this.input.releaseLock();
    });
    // Quicksave and quickload work from anywhere the game is running.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F5' || e.code === 'F9') e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'F5' && this.screen === 'play') this.quicksave();
      if (e.code === 'F9' && (this.screen === 'play' || this.screen === 'paused')) this.quickload();
    });

    this.loadWorld(true);
    // Asked once per page load, here: the answer records this build as seen,
    // so asking again on a later visit to the title would always say nothing.
    screens.showTitle(this, takeWhatsNew(browserStorage()));
    requestAnimationFrame(this.frame);
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.pipeline.resize();
    this.particles.setViewport(window.innerHeight * this.renderer.getPixelRatio());
  }

  // ================================================================== GameCtx

  get floor(): number {
    return this.save.floor;
  }

  get difficulty(): number {
    return difficultyFor(this.save.rung) * WORKPLACES[this.save.workplace].enemy;
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
    return titleFor(this.save.rung, this.save.domain, this.save.track, this.save.arch);
  }

  get questLog(): QuestState[] {
    return this.save.questLog;
  }

  floorName(): string {
    if (this.save.location === 'mokki') return `The Mökki - weekend ${this.save.week}`;
    const theme = THEMES[this.save.floor % THEMES.length];
    const n = this.save.floor;
    return n > FINAL_FLOOR ? `Overtime ${n - FINAL_FLOOR} - ${theme?.name ?? ''}` : `Floor ${n === 0 ? 'B1' : n} - ${theme?.name ?? ''}`;
  }

  // ================================================================== world

  clearWorld(): void {
    // A load or a new career mid-vision lands in the normal world: SUO comes
    // off before the floor it was dressing goes.
    this.abortVision();
    this.visionDue = false;
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
      f.sprite.material.map?.dispose();
      f.sprite.material.dispose();
    }
    this.floaters = [];
    for (const f of this.fxMeshes) {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
    }
    this.fxMeshes = [];
    for (const h of this.hazards) {
      this.scene.remove(h.mesh);
      h.mesh.geometry.dispose();
      (h.mesh.material as THREE.Material).dispose();
    }
    this.hazards = [];
    if (this.level !== undefined) {
      this.scene.remove(this.level.group);
      disposeTree(this.level.group, true);
    }
    this.lockerItems.clear();
    this.mentorAsk = null;
    this.particles.clear();
    this.mark = null;
    this.history = [];
    this.boss = null;
    this.rootT = 0;
    this.chargeT = 0;
    this.charging = false;
    this.swingQueued = false;
    this.dryFire = false;
    this.blocking = false;
  }

  loadWorld(fromSave: boolean): void {
    if (this.save.location === 'mokki') this.loadMokki(fromSave);
    else this.loadFloor(this.save.floor, fromSave);
  }

  loadFloor(n: number, fromSave: boolean): void {
    this.clearWorld();
    const s = this.save;
    s.floor = n;
    s.location = 'office';
    const fresh = !fromSave || s.floorState.floor !== n;
    if (fresh) {
      s.floorState = freshFloorState(n);
      s.queue = [];
    }
    const fs = s.floorState;
    const theme = THEMES[n % THEMES.length] ?? THEMES[0];
    if (theme === undefined) throw new Error('no theme');
    const seed = (s.seed + n * 977) >>> 0;
    this.levelRng = new Rng(seed ^ 0x5bd1e995);
    this.lootRng = new Rng((seed ^ 0x2545f491) + s.week);
    this.level = generateLevel(n, theme, seed);
    this.scene.add(this.level.group);
    this.scene.fog = new THREE.Fog(theme.fog, 6, 42);
    this.scene.background = new THREE.Color(theme.fog);
    this.hemi.color.setHex(theme.light);
    this.hemi.groundColor.setHex(theme.ambient);
    this.hemi.intensity = n === 0 ? 0.7 : 1.05;
    this.sun.intensity = 0;
    this.renderer.toneMappingExposure = 1.15;
    this.pipeline.bloom.strength = 0.5;
    this.pipeline.bloom.threshold = 0.82;
    this.player.outdoor = false;
    for (const l of this.lights) l.color.setHex(theme.light);
    // Whatever you already used on this floor stays used after a reload.
    for (const it of this.level.interactables) if (fs.used.includes(it.id)) it.used = true;

    const npc = storyNpcFor(n);
    // Whoever you already resolved on this floor stays resolved after a reload.
    const gone = new Set(fs.resolved);
    this.level.spawns.forEach((sp, k) => {
      if (sp.kind === 'reply') {
        for (let i = 0; i < 3; i++) {
          const idx = k * 4 + i;
          if (!gone.has(idx)) this.spawnAt(sp.kind, sp.x + (i - 1) * 0.8, sp.z + (i % 2) * 0.6, sp.room, false, { spawnIndex: idx });
        }
      } else if (sp.kind === 'npc') {
        // The PA has nothing left to offer once the story is over.
        if (s.flags[`story_${npc.id}_${n}`] !== true && !(npc.id === 'pa' && s.won)) this.spawnAt('npc', sp.x, sp.z, sp.room, false, { npc });
      } else {
        // Roll the elite either way, so the same people are elites after a reload.
        const elite = this.rollElite(sp.kind);
        if (!gone.has(k * 4)) this.spawnAt(sp.kind, sp.x, sp.z, sp.room, false, { elite, spawnIndex: k * 4 });
      }
    });
    fs.extras.forEach((x, i) => {
      if (fromSave && !gone.has(EXTRA_BASE + i)) {
        const a = this.spawnAt(x.kind, x.x, x.z, 0, false, { spawnIndex: EXTRA_BASE + i });
        if (a !== null && x.name !== undefined) a.name = x.name;
      }
    });
    const bossRoom = this.level.roomOf[toCell(this.level.bossSpawn.z) * this.level.w + toCell(this.level.bossSpawn.x)] ?? -1;
    this.elevatorOpen = fs.bossDone;
    if (!fs.bossDone) {
      this.boss = this.spawnAt('boss', this.level.bossSpawn.x, this.level.bossSpawn.z, bossRoom, false);
      this.bossMult = 1;
      this.rescaleBoss();
      // Carrying the Phoenix file, the Auditor would rather talk.
      if (this.boss !== null && n === 3 && evidenceHeld(this) >= 3 && s.flags.auditorFought !== true && s.flags.auditorAlly !== true) this.boss.docile = true;
    }
    this.slackedTerminals.clear();
    this.loggedOn.clear();
    this.player.pos.set(this.level.start.x, 0, this.level.start.z);
    this.player.yaw = Math.PI;
    this.player.pitch = 0;

    if (fresh) {
      s.quests = s.quests.filter((q) => q.kind !== 'boss' && q.kind !== 'printer' && q.kind !== 'deliver');
      delete s.consumables.laptop;
    } else {
      s.quests = s.quests.filter((q) => q.kind !== 'boss');
    }
    const b = this.boss?.boss;
    if (b !== undefined && b !== null && !fs.bossDone) {
      s.quests.unshift({
        id: s.nextQuestId++, kind: 'boss', title: `MAJOR INCIDENT: ${this.boss?.name ?? b.name}`,
        body: `${b.name} (${b.title}) is holding the corner office hostage. Resolve them to unlock the lift - and the weekend.`,
        from: 'The Service Desk', goal: 1, progress: 0, reward: 0, done: false,
      });
    }
    // A boss already resolved: whatever it dropped is still lying there.
    if (fs.bossDone) redropBossLoot(this);
    placeQuestContent(this);
    this.pendingStaff = null;
    scheduleStaffing(this, fresh);
    scheduleMentoring(this, fresh);
    this.spawnCompanions();
    if (!fromSave) host.consequencesOnArrival(this, n);
    this.field = flowField(this.level, this.player.pos.x, this.player.pos.z, 40);
    this.refreshDerived();
    this.markSeen();
    this.updateLights(true);
    this.settleWorld();
    sfx.setBoss(false);
    sfx.setAmbient('office');
    if (!fromSave) this.autosave();
  }

  /** Elites get commoner as you climb the building and the ladder. */
  private rollElite(kind: ActorKind): EliteAffix | null {
    if (kind === 'reply' || kind === 'mosquito' || kind === 'healer' || kind === 'helper' || kind === 'npc' || kind === 'tonttu') return null;
    const chance = Math.min(0.2, 0.03 + this.save.floor * 0.015 + this.save.rung * 0.006);
    return this.levelRng.chance(chance) ? this.levelRng.pick(ELITE_AFFIXES) : null;
  }

  /** Musti comes along, if you have a dog. */
  spawnCompanions(): void {
    if (!this.save.upgrades.includes('dog')) return;
    const p = this.level.start;
    this.spawnAt('helper', p.x + 1.2, p.z + 1.2, -1, false, { role: 'dog' });
  }

  /** Recompute the boss's strength when the reasons for it change (findings, deals). */
  rescaleBoss(): void {
    const a = this.boss;
    if (a === null || a.resolved) return;
    const s = this.save;
    let mult = 1;
    if (s.flags.mokkiDeal === true && s.floor === FINAL_FLOOR) mult *= 0.5;
    if (s.flags.exposed === true && s.floor === FINAL_FLOOR) mult *= 0.6;
    if (s.flags.whistleblower === true && s.floor % 5 === 3) mult *= 0.6;
    if (a.boss?.name === 'The Auditor') mult *= 1 + s.findings * 0.25;
    if (mult === this.bossMult) return;
    const k = mult / this.bossMult;
    a.hp *= k;
    a.maxHp *= k;
    this.bossMult = mult;
  }

  loadMokki(fromSave: boolean): void {
    this.clearWorld();
    const s = this.save;
    s.location = 'mokki';
    this.level = generateMokki((s.seed ^ 0x6d6f6b6b) >>> 0, false, s.upgrades);
    this.levelRng = new Rng(s.seed + s.week);
    this.lootRng = new Rng((s.seed ^ 0x51ed270b) + s.week);
    this.scene.add(this.level.group);
    // The white night: the sun low in the north, a sky that never quite gets dark.
    this.scene.background = new THREE.Color(0xf2c6a4);
    this.scene.fog = new THREE.Fog(0xe8c0a8, 30, 150);
    this.hemi.color.setHex(0xbfd8ff);
    this.hemi.groundColor.setHex(0x3a5a2a);
    this.hemi.intensity = 1.35;
    this.sun.intensity = 2.8;
    // Outdoors the sky is bright: expose for it, and keep the bloom for the sun.
    this.renderer.toneMappingExposure = 0.82;
    this.pipeline.bloom.strength = 0.22;
    this.pipeline.bloom.threshold = 0.95;
    // Low in the north, long shadows across the grass.
    const mid = new THREE.Vector3((this.level.w * TILE) / 2, 0, (this.level.h * TILE) / 2);
    this.sun.position.copy(mid).addScaledVector(MOKKI_SUN, 90);
    this.sun.target.position.copy(mid);
    this.player.outdoor = true;
    for (const l of this.lights) l.visible = false;
    for (const sp of this.level.spawns) this.spawnAt(sp.kind, sp.x, sp.z, 0, false);
    // A weekend visitor, if there is a guest room for them.
    if (s.upgrades.includes('guestroom') && !s.weekend.visitorDone) {
      const v = this.spawnAt('healer', this.level.start.x + 6, this.level.start.z + 8, 0, false);
      if (v !== null) setMarker(v, '!', '#ff9ad5');
    }
    this.player.pos.set(this.level.start.x, 0, this.level.start.z);
    this.player.yaw = Math.PI;
    this.player.pitch = -0.05;
    this.spawnCompanions();
    this.elevatorOpen = true;
    this.field = flowField(this.level, this.player.pos.x, this.player.pos.z, 40);
    this.refreshDerived();
    this.settleWorld();
    sfx.setBoss(false);
    sfx.setAmbient('mokki');
    if (!fromSave) this.autosave();
  }

  /**
   * Fit the renderer to the world just built.
   *
   * The camera draws no further than the fog can be seen through: indoors the
   * fog is solid by 42 m and everything behind it is a draw call that paints
   * fog-coloured pixels over fog. The sun only casts where it shines (the
   * office has it at zero, and a shadow map for a dark sun is a whole extra
   * pass of the scene every frame). And the new world's shaders are compiled
   * now, behind the loading moment, not the first time each thing turns up on
   * screen in the middle of a fight.
   */
  private settleWorld(): void {
    const fog = this.scene.fog;
    this.camera.far = fog instanceof THREE.Fog ? fog.far + 2 : 160;
    this.camera.updateProjectionMatrix();
    this.syncSunShadow();
    this.precompile();
  }

  /**
   * Compile every shader the scene needs now, behind a loading moment or a
   * crossing, rather than the first time each thing turns up on screen.
   */
  precompile(): void {
    // Compiled against the pass chain's buffer, because that is what the scene
    // is drawn into: a shader built for the canvas (sRGB, tone-mapped) is a
    // different program, and the real one would still compile mid-fight.
    // compileAsync picks every program synchronously, so the target only has
    // to be in place for the call itself.
    const target = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.pipeline.composer.readBuffer);
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
    this.renderer.setRenderTarget(target);
  }

  private syncSunShadow(): void {
    this.sun.castShadow = this.settings.quality !== 'low' && this.sun.intensity > 0;
  }

  spawnAt(kind: ActorKind, x: number, z: number, room: number, aggro: boolean, opts: SpawnOpts = {}): Actor | null {
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
    castShadows(a.root);
    if (aggro) a.aggro = true;
    // The CEO's hat: managers will not start anything with you.
    if (kind === 'manager' && this.derivedCache.specials.has('ceoCrown')) {
      a.docile = true;
      a.aggro = false;
    }
    if (kind === 'helper') initTeammate(this, a);
    this.actors.push(a);
    return a;
  }

  spawn(kind: ActorKind, x: number, z: number, room: number): Actor | null {
    if (this.actors.filter((a) => !a.resolved && a.hostile).length > 70) return null;
    return this.spawnAt(kind, x, z, room, true);
  }

  // ================================================================== saves & settings

  private loadLatest(): SaveState | null {
    const id = latestSlot();
    if (id !== null) {
      const slot = readSlot(id);
      const s = slot === null ? null : normalizeSave(slot.data);
      if (s !== null) return s;
    }
    const legacy = loadLegacy();
    if (legacy !== null) {
      const s = normalizeSave(legacy);
      if (s !== null) {
        this.writeSlotFor('auto', s);
        clearLegacy();
      }
      return s;
    }
    return null;
  }

  hasSave(): boolean {
    return latestSlot() !== null;
  }

  writeSlotFor(id: SlotId, s: SaveState = this.save): boolean {
    // A vision is never saved: whatever asks waits until you surface.
    if (this.vision !== null) return false;
    return writeSlot(id, { name: s.name, title: titleFor(s.rung, s.domain, s.track, s.arch), where: this.level === undefined ? '' : this.floorName(), level: s.level }, s);
  }

  autosave(): void {
    if (this.save.won && this.screen === 'ending') return;
    if (this.vision !== null) return;
    if (this.settings.autosave || this.save.ironman) this.writeSlotFor('auto');
  }

  quicksave(): void {
    if (this.vision !== null) {
      this.vision.say(SUO_LINES.noSave);
      return;
    }
    if (this.save.ironman) {
      this.hud.toast('Ironman: no quicksaves. The building only remembers what you did.', 'bad');
      return;
    }
    if (this.writeSlotFor('quick')) this.hud.toast('Quicksaved. (F9 to load)', 'good');
    else this.hud.toast('Could not save: this browser is not keeping anything.', 'bad');
  }

  quickload(): void {
    if (this.save.ironman) {
      this.hud.toast('Ironman: there is no going back.', 'bad');
      return;
    }
    this.loadSlot('quick');
  }

  loadSlot(id: SlotId): boolean {
    const slot = readSlot(id);
    const s = slot === null ? null : normalizeSave(slot.data);
    if (s === null) {
      this.hud.toast('Nothing saved there.', 'bad');
      return false;
    }
    this.save = s;
    this.fixCache = new WeakMap();
    this.os.hide();
    this.dialogue.close();
    this.derivedCache = derive(s);
    this.resetTransient();
    this.loadWorld(true);
    screens.startPlay(this);
    this.hud.toast(`Loaded: ${s.name}, ${this.title} (${this.floorName()}).`, 'good');
    return true;
  }

  /** Buffs and timers that belong to the moment, not the save. */
  resetTransient(): void {
    this.invisT = 0;
    this.sisuT = 0;
    this.saunaT = 0;
    this.rootT = 0;
    this.hitStop = 0;
    this.slowT = 0;
    this.charging = false;
    this.chargeT = 0;
    this.swingQueued = false;
    this.dryFire = false;
    this.blocking = false;
    this.caughtPending = false;
    this.hurtFlash = 0;
    this.visionDue = false;
  }

  applySettings(): void {
    const st = this.settings;
    saveSettings(st);
    this.camera.fov = st.fov;
    this.camera.updateProjectionMatrix();
    const ratio = Math.min(window.devicePixelRatio, st.quality === 'low' ? 1 : 1.5) * st.renderScale;
    this.renderer.setPixelRatio(Math.max(0.35, ratio));
    this.pipeline.configure(st.quality, st.bloom);
    this.resize();
    const lights = st.quality === 'low' ? 3 : st.quality === 'medium' ? 5 : 8;
    this.lights.forEach((l, i) => { l.userData.enabled = i < lights; });
    // Real shadows on medium (the sun) and high (the nearest ceiling light too).
    const shadows = st.quality !== 'low';
    this.renderer.shadowMap.enabled = shadows;
    this.syncSunShadow();
    this.sun.shadow.mapSize.setScalar(st.quality === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    setBlobShadows(st.quality !== 'high');
    this.particles.density = st.quality === 'low' ? 0.4 : st.quality === 'medium' ? 0.7 : 1;
    // Materials compile differently with shadows on or off.
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats as THREE.Material[]) m.needsUpdate = true;
      }
    });
    sfx.setVolume(st.sfx);
    sfx.setMusicVolume(st.music);
    this.compass.visible = st.compass;
    this.player.view = st.view;
    this.lightIn = 0;
  }

  /** A one-off hint, the first time something happens (if tips are on). */
  tip(id: keyof typeof TIPS): void {
    const s = this.save;
    if (!this.settings.tips || s.tipsShown.includes(id)) return;
    const text = TIPS[id];
    if (text === undefined) return;
    s.tipsShown.push(id);
    this.hud.tip(text);
  }

  achieve(id: string): void {
    const s = this.save;
    if (s.achievements.includes(id)) return;
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a === undefined) return;
    s.achievements.push(id);
    sfx.achievement();
    this.hud.toast(`🏆 ACHIEVEMENT: ${a.name} - ${a.desc}`, 'epic');
  }

  // ================================================================== dialogue & menus

  openDialogue(node: DialogueNode, after?: () => void): void {
    this.screen = 'dialogue';
    this.input.enabled = false;
    this.input.releaseLock();
    this.afterDialogue = after ?? null;
    this.dialogue.show(node, () => {
      const cb = this.afterDialogue;
      this.afterDialogue = null;
      if (this.screen === 'dialogue') screens.resume(this);
      cb?.();
      if (this.screen === 'play') this.autosaveSoon();
    });
  }

  /** Save shortly after a conversation, once whatever it set in motion has happened. */
  autosaveSoon(): void {
    this.saveIn = Math.min(this.saveIn, 1);
  }

  chainDialogues(queue: (() => DialogueNode)[]): void {
    const next = queue.shift();
    if (next === undefined) return;
    this.openDialogue(next(), () => this.chainDialogues(queue));
  }

  openOs(mode: 'desk' | 'itdesk' | 'pack', first?: Parameters<Os['open']>[1]): void {
    this.screen = 'os';
    screens.hideOverlay(this);
    this.input.enabled = false;
    this.input.releaseLock();
    if (mode === 'desk') sfx.boot();
    this.os.open(mode, first);
  }

  close(): void {
    this.os.hide();
    this.currentTerminal = null;
    screens.resume(this);
    this.autosaveSoon();
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
    screens.showChargen(this);
  }

  beginCareer(setup: CharacterSetup): void {
    this.save = newSave(Date.now() >>> 0, setup);
    this.derivedCache = derive(this.save);
    this.resetTransient();
    this.fixCache = new WeakMap();
    this.os.hide();
    this.loadFloor(0, false);
    this.journal(`Day one. ${this.save.name}, ${this.title}. The badge photo is terrible.`);
    screens.startPlay(this);
    this.openDialogue(said('Morag from Internal IT', `Welcome to Workgrumble, ${this.save.name}. Here is a stapler and a label maker. The users have tickets; the tickets have users. Computers are blue on the map; I am green. You can talk most people down (E) instead of stapling them. Hold the mouse to wind up a heavy swing, hold the right button to block. Every Friday you go to the mökki. Do not drink from the office fridge. Good luck.`, 'neutral', 'Clock in'), () => this.tip('start'));
  }

  // ================================================================== loop

  /** Balance bots: the loop stops drawing and `step` drives the simulation instead. */
  headless = false;

  /**
   * Out of play (a menu, a dialogue, a computer), a held melee button is let
   * go of for good: the first frame back must not swing on a release that
   * happened behind the menu.
   */
  dropMeleeHold(): void {
    if (!this.charging && !this.swingQueued && this.player.charge === 0) return;
    dropHold(this);
    this.player.charge = 0;
  }

  /** One tick of the simulation, without drawing anything. */
  step(dt: number): void {
    if (this.screen !== 'play') this.dropMeleeHold();
    if (this.screen === 'play') {
      if (this.hitStop > 0) {
        this.hitStop -= dt;
      } else {
        this.time += dt;
        this.update(dt);
      }
    } else if (this.screen === 'os' && this.currentTerminal !== null) {
      tickQuests(this, dt);
    }
    this.player.update(this.level, this.screen === 'play' ? dt : 0, 0);
    this.particles.update(this.screen === 'play' ? dt : 0);
    this.input.endFrame();
    this.markersIn -= dt;
    if (this.markersIn <= 0) {
      this.markersIn = 0.3;
      this.markers = questMarkers(this);
    }
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.headless) return;
    if (this.screen !== 'play') this.dropMeleeHold();
    if (this.screen === 'play') {
      if (this.hitStop > 0) {
        this.hitStop -= dt;
      } else {
        this.time += dt;
        this.update(dt);
      }
    } else if (this.screen === 'os' && this.currentTerminal !== null) {
      // At a computer, a P1 clock keeps running: the bridge call does not wait for you to log in.
      tickQuests(this, dt);
    }
    sfx.music(this.screen === 'play' ? dt : 0);
    this.player.view = this.settings.view;
    const sway = this.derivedCache.band.sway * (this.derivedCache.caffeine.speed > 0 ? 0.7 : 1) + this.derivedCache.caffeine.jitter * 0.3;
    this.player.update(this.level, this.screen === 'play' ? dt : 0, sway);
    if (this.screen === 'title' || this.screen === 'chargen') this.titleCamera(now / 1000);
    if (this.shakeAmt > 0) {
      const k = this.settings.shake ? 0.15 : 0.03;
      this.camera.position.x += fx.range(-1, 1) * this.shakeAmt * k;
      this.camera.position.y += fx.range(-1, 1) * this.shakeAmt * k;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2);
    }
    this.cullHidden();
    this.billboards();
    this.animateScenery();
    this.updateMood(dt);
    this.particles.update(this.screen === 'play' ? dt : 0);
    this.pipeline.render();
    this.input.endFrame();
    // Under the steam the HUD is gone: one serif line and the steam meter (the vision's own).
    const visible = (this.screen === 'play' || this.screen === 'os' || this.screen === 'dialogue' || this.screen === 'minigame') && this.vision === null;
    if (visible) {
      this.markersIn -= dt;
      if (this.markersIn <= 0) {
        this.markersIn = 0.3;
        this.markers = questMarkers(this);
      }
      this.hud.update(this.hudFrame(), dt);
      if (this.settings.compass) this.compass.update(this.player.pos.x, this.player.pos.z, this.player.yaw, this.markers);
    }
    this.hud.root.style.display = visible ? 'block' : 'none';
    this.compass.visible = visible && this.settings.compass;
    this.hud.crosshair.style.display = this.screen === 'play' ? 'block' : 'none';
  };

  private hudFrame(): HudFrame {
    const s = this.save;
    const sp = s.spell === null ? undefined : spellById(s.spell);
    const domainReady = s.rung >= 4 && s.domain !== null;
    const tol = s.caffeineTol;
    const factor = effectiveCaffeine(1, tol);
    const band = caffeineBand(s.caffeine, tol);
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
      spellText: sp === undefined ? 'No runes (find the Saunatonttu)' : spellLabel(this, sp),
      abilityText: domainReady ? `${s.domain ?? ''} (G): ${this.abilityCd > 0 ? `${Math.ceil(this.abilityCd)}s` : 'ready'}` : '',
      hidden: this.player.crouching ? !this.actors.some((a) => a.hostile && a.aggro && !a.resolved) : null,
      bandLabel: BAND_EFFECTS[bandFor(s.bac, this.derivedCache.specials.has('flask'))].label,
      promille: promille(s.bac),
      bacForecast: Math.min(100, s.bac + s.stomach),
      peakZone: this.derivedCache.specials.has('flask') ? [21, 41] : [26, 36],
      caffeine: s.caffeine * factor,
      caffeineLabel: s.crash > 0 ? 'CRASH' : CAFFEINE_EFFECTS[band].label.toUpperCase() === 'DECAF' ? 'Decaf' : CAFFEINE_EFFECTS[band].label.toUpperCase(),
      caffeineZone: [50, 300],
      crash: s.crash,
      questLines: questLines(this),
      overload: this.save.location === 'office' ? this.derivedCache.overload : 0,
      markers: this.markers,
      charge: this.derivedCache.weapon.kind === 'melee' ? chargeShown(this, POWER_TIME) : 0,
      blocking: this.blocking,
      dry: this.dryFire,
      oncall: pagerHud(this),
    };
  }

  refreshDerived(): void {
    this.derivedCache = derive(this.save);
    this.player.setTool(this.derivedCache.weapon.id);
    if (this.save.sanity > this.derivedCache.maxSanity) this.save.sanity = this.derivedCache.maxSanity;
    if (this.save.loyly > this.derivedCache.maxLoyly) this.save.loyly = this.derivedCache.maxLoyly;
  }

  derived(): Derived {
    return this.derivedCache;
  }

  private update(dt: number): void {
    // Under the steam the office's clocks stand still: no queue, no pager,
    // no people, no trickle. Only the steam meter runs.
    if (this.visionDue && this.vision === null) this.startVision();
    if (this.vision !== null) {
      const end = this.vision.update(dt);
      if (end !== null) this.endVision(end);
      return;
    }
    const inp = this.input;
    const s = this.save;
    const d = this.derivedCache;

    this.look();
    if (this.hit('view')) {
      this.settings.view = this.settings.view === 'first' ? 'third' : 'first';
      saveSettings(this.settings);
      this.hud.toast(this.settings.view === 'first' ? 'First person' : 'Third person');
    }
    if (this.hit('map')) this.hud.mapOpen = !this.hud.mapOpen;
    if (this.hit('backpack') || inp.hit('KeyI')) {
      this.openOs('pack');
      return;
    }
    if (this.hit('journal')) {
      this.openOs('pack', 'journal');
      return;
    }
    if (inp.hit('Escape')) {
      this.pause();
      return;
    }
    if (this.hit('sneak') || inp.hit('ControlLeft')) {
      this.player.crouching = !this.player.crouching;
      this.hud.toast(this.player.crouching ? 'Sneaking. Unaware people take sneak attacks.' : 'Standing up.');
      if (this.player.crouching) this.tip('sneak');
    }
    if (this.hit('rest')) host.tryRest(this);
    if (this.hit('nextspell')) cycleSpell(this);
    if (this.hit('cast')) castSpell(this);
    if (this.hit('ability')) domainAbility(this);
    if (this.screen !== 'play') return;

    // Tools: 1-9 and the wheel cycle through the weapons you carry.
    const weapons = s.gear.filter((g) => itemById(g.base)?.slot === 'weapon');
    for (let i = 0; i < 9; i++) {
      const w = weapons[i];
      if (inp.hit(`Digit${i + 1}`) && w !== undefined) this.equipGear(w.uid);
    }
    if (inp.wheel !== 0 && weapons.length > 1) {
      const cur = weapons.findIndex((g) => g.uid === s.equipped.weapon);
      const next = weapons[(cur + inp.wheel + weapons.length) % weapons.length];
      if (next !== undefined) this.equipGear(next.uid);
    }

    this.tickTimers(dt);
    tickVices(this, dt);
    tickCaffeine(this, dt);
    tickQuests(this, dt);
    if (this.screen !== 'play') return;
    tickPager(this, dt);
    tickTeam(this, dt);

    // Manager auras, and the smell test.
    this.auraSlow = 0;
    const mgmtEase = Math.max(0, s.standing.management) / 200;
    for (const a of this.actors) {
      if (a.resolved || !a.aggro) continue;
      if (a.kind !== 'manager' && a.kind !== 'boss' && a.kind !== 'consultant') continue;
      const dist = Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z);
      if (dist < (a.kind === 'boss' ? 9 : 7)) this.auraSlow = Math.max(this.auraSlow, (a.kind === 'boss' ? 0.3 : 0.35) * (1 - d.auraResist) * (1 - mgmtEase));
      if (a.kind === 'manager' && dist < 3.5 && this.caughtCd <= 0) host.caughtCheck(this, a);
    }
    if (this.screen !== 'play') return;

    // Movement.
    const { x: side, y: fwd } = this.moveInput();
    const sy = Math.sin(this.player.yaw);
    const cy = Math.cos(this.player.yaw);
    let wx = -sy * fwd + cy * side;
    let wz = -cy * fwd - sy * side;
    let speed = 5.2 * d.speedMult;
    if (d.overEncumbered) speed *= 0.55;
    speed *= 1 - this.auraSlow;
    speed *= 1 - this.hazardSlow;
    if (this.slowT > 0 && !d.ultra) speed *= 0.6;
    if (this.player.crouching && perk(s, 'silentkeys') === 0) speed *= 0.55;
    if (this.blocking) speed *= 0.5;
    if (this.charging && this.chargeT > TAP_TIME && d.weapon.kind === 'melee') speed *= 0.75;
    const moving = fwd !== 0 || side !== 0;
    const sprint = this.down('sprint') && moving && !d.overEncumbered && s.energy > 1 && !this.player.crouching && !this.blocking;
    if (sprint) {
      speed *= 1.45 + skill(s, 'athletics') * 0.004;
      if (!d.specials.has('sandals') && !d.ultra) s.energy = Math.max(0, s.energy - 24 * (perk(s, 'stairsguy') > 0 ? 0.6 : 1) * dt);
      this.athleticsT += dt;
      if (this.athleticsT > 2) {
        this.athleticsT = 0;
        this.exercise('athletics', 1);
      }
    } else if (!this.blocking) {
      s.energy = Math.min(100, s.energy + 11 * d.energyRegen * dt);
    }
    // Hammered: the floor has opinions. (Iron Will: it does not.)
    if (d.band.sway >= 1.5 && moving && perk(s, 'ironwill') === 0) {
      this.stumbleT -= dt;
      if (this.stumbleT <= 0) {
        this.stumbleT = fx.range(2, 5);
        wx += fx.range(-1, 1) * 2;
        wz += fx.range(-1, 1) * 2;
        this.hud.toast('*hic* The floor moved.', 'info');
      }
    }
    if (this.rootT > 0) speed = 0;
    const jump = this.hit('jump') && this.rootT <= 0 && !this.player.crouching;
    this.player.move(this.level, wx, wz, speed, jump, dt, d.jump);
    if (moving && speed > 0 && this.player.onGround) {
      this.stepIn -= dt * speed;
      if (this.stepIn <= 0) {
        this.stepIn = 2.2;
        if (!this.player.crouching) sfx.step();
      }
    }

    // Stealth practice, and Ghost Mode: stand still in the shadows to vanish.
    if (this.player.crouching) {
      if (moving) {
        this.stillT = 0;
        const near = this.actors.some((a) => a.hostile && !a.aggro && !a.resolved && Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) < 10);
        if (near) {
          this.stealthT += dt;
          if (this.stealthT > 1.5) {
            this.stealthT = 0;
            this.exercise('stealth', 1);
          }
        }
      } else if (perk(s, 'ghost') > 0) {
        this.stillT += dt;
        if (this.stillT > 2) this.invisT = Math.max(this.invisT, 0.3);
      }
    } else {
      this.stillT = 0;
    }

    playerAttackInput(this, dt);

    findPrompt(this);
    if (this.hit('interact')) interact(this);
    if (this.hit('quickuse')) host.quickUse(this);
    if (this.screen !== 'play') return;

    // World.
    this.fieldIn -= dt;
    if (this.fieldIn <= 0) {
      this.fieldIn = 0.35;
      this.field = flowField(this.level, this.player.pos.x, this.player.pos.z, 40);
    }
    updateAuras(this.actors);
    for (const a of this.actors) {
      const far = Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) > ACTOR_RANGE;
      a.root.visible = !far;
      if (far && !a.aggro && !a.recruited) continue;
      updateActor(this, a, dt);
      if (a.hostile && !a.resolved && a.hp <= 0) resolveActor(this, a);
    }
    this.actors = this.actors.filter((a) => {
      if (a.resolved && a.removeIn <= 0) {
        disposeActor(this.scene, a);
        return false;
      }
      return true;
    });
    updateProjectiles(this, dt);
    updatePickups(this, dt);
    updateHazards(this, dt);
    updateFx(this, dt);

    if (s.location === 'office') {
      for (const q of [...s.queue]) {
        q.sla -= dt;
        if (q.sla <= 0) breach(this, q);
      }
      // Escort and room objectives: arriving somewhere counts.
      const room = this.level.roomOf[toCell(this.player.pos.z) * this.level.w + toCell(this.player.pos.x)] ?? -1;
      const rm = this.level.rooms[room];
      if (rm !== undefined) questEvent(this, { type: 'room', room: rm.kind });
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
      this.saveIn = 60;
      this.autosave();
    }
    if (s.sanity < d.maxSanity * 0.3) this.tip('lowsanity');
    if (d.overEncumbered) this.tip('encumbered');

    // Sisu, Unbreakable and the Nokia stand between you and a burnout, whatever did it.
    if (s.sanity <= 0 && this.screen === 'play' && !lastStand(this)) screens.showDead(this);
  }

  /** Mouse look. */
  look(): void {
    const inp = this.input;
    const sens = 0.0022 * this.settings.sensitivity;
    this.player.yaw -= inp.mouseDX * sens;
    this.player.pitch = Math.max(-1.35, Math.min(1.35, this.player.pitch - inp.mouseDY * sens * (this.settings.invertY ? -1 : 1)));
  }

  /** The movement keys held: x strafes (right +), y walks (forward +). The vector is reused. */
  private moveInput(): THREE.Vector2 {
    const inp = this.input;
    let fwd = 0;
    let side = 0;
    if (this.down('forward') || inp.down('ArrowUp')) fwd += 1;
    if (this.down('back') || inp.down('ArrowDown')) fwd -= 1;
    if (this.down('right') || inp.down('ArrowRight')) side += 1;
    if (this.down('left') || inp.down('ArrowLeft')) side -= 1;
    return this.moveDir.set(side, fwd);
  }

  /**
   * A plain walk at `pace` of the usual speed: no sprint, no jump, no
   * stumbling. How you move under the steam.
   */
  walk(dt: number, pace: number): void {
    const { x: side, y: fwd } = this.moveInput();
    const sy = Math.sin(this.player.yaw);
    const cy = Math.cos(this.player.yaw);
    const speed = 5.2 * this.derivedCache.speedMult * pace;
    this.player.move(this.level, -sy * fwd + cy * side, -cy * fwd - sy * side, speed, false, dt, this.derivedCache.jump);
    if ((fwd !== 0 || side !== 0) && this.player.onGround) {
      this.stepIn -= dt * speed;
      if (this.stepIn <= 0) {
        this.stepIn = 2.2;
        sfx.step();
      }
    }
  }

  pause(): void {
    this.input.releaseLock();
    screens.showPause(this);
  }

  // ================================================================== SUO

  /**
   * A Löyly gain has just been applied (and clamped): does it take you under?
   * `before` is the meter before the gain, `gain` the gain as offered. Only
   * the deliberate gains call this - a sauna, a Salmari, a rest; the trickle
   * and combat never do (and the rule refuses them anyway).
   */
  steamOverflow(source: LoylySource, before: number, gain: number): void {
    const s = this.save;
    const pp = this.player.pos;
    let hostileAt = Infinity;
    for (const a of this.actors) {
      if (!a.hostile || a.resolved || !a.aggro) continue;
      hostileAt = Math.min(hostileAt, Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z));
    }
    const spent = s.location === 'mokki' ? s.weekend.suo : s.floorState.suo;
    const r = overflowDecision({ source, before, gain, max: this.derivedCache.maxLoyly, spent, hostileAt });
    if (r === 'wait') this.hud.toast(SUO_LINES.wait, 'info');
    if (r === 'go') this.visionDue = true;
  }

  private startVision(): void {
    this.visionDue = false;
    const s = this.save;
    if (s.location === 'mokki') s.weekend.suo = true;
    else s.floorState.suo = true;
    this.prompt = '';
    this.promptTarget = null;
    this.hud.mapOpen = false;
    this.player.crouching = false;
    this.vision = new Vision(this);
    this.hitStop = CROSSING_STOP;
    this.precompile();
  }

  /** Surface: the world as it was, the blessing if you took its hand, and the saves that waited. */
  private endVision(how: VisionEnd): void {
    const v = this.vision;
    if (v === null) return;
    this.vision = null;
    this.lastVisionDiff = v.end(true);
    this.hitStop = CROSSING_STOP;
    this.precompile();
    this.updateLights(true);
    const s = this.save;
    if (how === 'blessed') {
      s.sanity = this.derivedCache.maxSanity;
      s.suoBlessing = true;
      this.hud.toast(SUO_LINES.blessed, 'epic');
      this.journal('Under the steam, something took my hand. I came back lighter.');
    } else {
      this.hud.toast(SUO_LINES.leave, 'info');
    }
    this.autosaveSoon();
  }

  /** Cut a vision short without ceremony (a load, a new career, the title screen). */
  abortVision(): void {
    const v = this.vision;
    if (v === null) return;
    this.vision = null;
    this.lastVisionDiff = v.end(false);
  }

  /** A bound action pressed this frame. */
  hit(a: Action): boolean {
    return this.input.hit(this.settings.keys[a]);
  }

  down(a: Action): boolean {
    return this.input.down(this.settings.keys[a]);
  }

  private tickTimers(dt: number): void {
    const s = this.save;
    const d = this.derivedCache;
    this.attackCd -= dt;
    this.shoveCd -= dt;
    this.rootT = Math.max(0, this.rootT - dt * (perk(s, 'teflon') > 0 ? 2 : 1));
    this.sisuT = Math.max(0, this.sisuT - dt);
    this.invisT = Math.max(0, this.invisT - dt);
    this.saunaT = Math.max(0, this.saunaT - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.caughtCd = Math.max(0, this.caughtCd - dt);
    this.faceT -= dt;
    if (this.faceT <= 0) this.faceMood = 'normal';
    // Löyly seeps back slowly; sanity trickles back with Patience.
    s.loyly = Math.min(d.maxLoyly, s.loyly + (0.35 + s.attrs.tech * 0.004) * dt);
    const second = perk(s, 'secondwind') > 0 && s.sanity < d.maxSanity * 0.25 ? 3 : 1;
    const ultra = d.ultra ? 3 : 0;
    s.sanity = Math.min(d.maxSanity, s.sanity + (s.attrs.patience * 0.003 + d.band.regen + ultra) * second * dt - d.caffeine.drain * dt);
    this.slowT = Math.max(0, this.slowT - dt);
  }

  private effects(): string[] {
    const s = this.save;
    const d = this.derivedCache;
    const out: string[] = [];
    if (this.rootT > 0) out.push(`📅 ${this.rootReason} (${this.rootT.toFixed(1)}s)`);
    if (this.auraSlow > 0) out.push(`🐢 Manager nearby: -${Math.round(this.auraSlow * 100)}% speed`);
    if (this.hazardSlow > 0) out.push('🫗 Standing in something');
    if (d.overEncumbered) out.push('🎒 OVER-ENCUMBERED');
    if (s.actionItems > 0) out.push(`📋 ${s.actionItems} action item${s.actionItems > 1 ? 's' : ''}`);
    if (s.empties > 0) out.push(`🥫 ${s.empties} empties (evidence)`);
    if (s.crash > 0) out.push(`💤 Caffeine crash ${Math.ceil(s.crash)}s`);
    if (s.hangover > 0) out.push(`🤕 Hangover ${Math.ceil(s.hangover)}s`);
    if (s.dependency >= 50 && s.bac < 5) out.push('🫨 THE SHAKES (withdrawal)');
    if (this.sisuT > 0) out.push(`🪨 Sisu ${Math.ceil(this.sisuT)}s`);
    if (this.invisT > 0) out.push(`🌫 Unseen ${Math.ceil(this.invisT)}s`);
    if (s.saunaBuff) out.push('🧖 Löyly-blessed (+25% damage)');
    if (s.suoBlessing) out.push(SUO_LINES.effect);
    if (s.makkara) out.push('🌭 Makkara-fed');
    if (s.hauki) out.push('🐟 Pike supper');
    if (s.palju) out.push('♨ Palju-soaked');
    if (this.player.crouching) out.push('🐾 Sneaking');
    if (s.warnings > 0) out.push(`⚠ ${s.warnings}/3 HR warnings`);
    return out;
  }

  private ammoText(): string {
    const w = this.derivedCache.weapon;
    if (w.ammo !== undefined) return `${w.ammo}: ${this.save.ammo[w.ammo]}`;
    if (w.energyCost !== undefined) return `Energy ${Math.floor(this.save.energy)}/${w.energyCost} per use`;
    return w.kind === 'melee' ? 'Melee · hold for a heavy swing' : 'Melee';
  }

  // ================================================================== skills & standing (StoryHost)

  /** Use a skill; announce when it goes up, Morrowind-style. */
  exercise(k: Skill, amount: number): void {
    const before = levelUpReady(this.save);
    const v = useSkill(this.save, k, amount);
    if (v === null) return;
    this.skillRose(k, v, before);
  }

  private skillRose(k: Skill, v: number, wasReady: boolean): void {
    this.hud.toast(`Your ${SKILL_INFO[k].name} skill increased to ${v}.`, 'good');
    sfx.chime();
    this.refreshDerived();
    if (!wasReady && levelUpReady(this.save)) {
      this.hud.toast('You should rest and meditate on what you have learned. (T to rest)', 'epic');
      this.tip('levelup');
    }
  }

  /** Books and trainers: a flat point, still counting toward the level. */
  bumpSkill(k: Skill): void {
    const before = levelUpReady(this.save);
    const v = raiseSkill(this.save, k);
    if (v !== null) this.skillRose(k, v, before);
  }

  odds(k: Skill, attr: Attribute, difficulty: number): number {
    return checkChance(skill(this.save, k), this.save.attrs[attr], difficulty, this.derivedCache.persuade * (k === 'soft' ? 1 : 0.5));
  }

  check(k: Skill, attr: Attribute, difficulty: number): boolean {
    const ok = fx.chance(this.odds(k, attr, difficulty));
    this.exercise(k, ok ? 2 : 1);
    if (ok) sfx.chime();
    else sfx.error();
    return ok;
  }

  standing(f: Faction, delta: number): void {
    adjustStanding(this.save, f, delta);
    if (Math.abs(delta) >= 2) this.hud.toast(`${FACTION_INFO[f].name}: ${delta > 0 ? '+' : ''}${delta}`, delta > 0 ? 'good' : 'bad');
  }

  /** Rep, scaled by the employer for what you earn (never for what you spend). */
  addRep(n: number): void {
    const v = n > 0 ? Math.round(n * WORKPLACES[this.save.workplace].rep) : n;
    this.save.rep = Math.max(0, this.save.rep + v);
    if (v !== 0) this.hud.toast(`${v > 0 ? '+' : ''}₡${v}`, v > 0 ? 'good' : 'bad');
  }

  flag(key: string, value: boolean | number = true): void {
    this.save.flags[key] = value;
  }

  journal(text: string): void {
    this.save.journal.push({ floor: this.save.floor, text });
    if (this.save.journal.length > 160) this.save.journal.shift();
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'epic' = 'info'): void {
    this.hud.toast(text, kind);
  }

  finding(n: number, why: string): void {
    this.save.findings += n;
    this.journal(`Audit finding: ${why}`);
    this.hud.toast(`The Auditor will hear about this. (${this.save.findings} finding${this.save.findings > 1 ? 's' : ''})`, 'bad');
    this.rescaleBoss();
  }

  clearFindings(): void {
    this.save.findings = 0;
    this.rescaleBoss();
  }

  warn(why: string): void {
    const s = this.save;
    s.warnings += 1;
    adjustStanding(s, 'management', -5);
    this.journal(`HR warning: ${why}.`);
    this.hud.toast(`HR WARNING ${s.warnings}/3: ${why}.`, 'bad');
    sfx.error();
    this.tip('warning');
    if (s.warnings >= 3) this.hud.toast('Three warnings. HR will see you at your next computer log-on, or on Friday.', 'bad');
  }

  promote(domain: Domain | null, track: Track | null, arch: ArchPath | null): void {
    const s = this.save;
    s.rung = Math.min(RUNG_COUNT - 1, s.rung + 1);
    if (domain !== null) s.domain = domain;
    if (track !== null) s.track = track;
    if (arch !== null) s.arch = arch;
    adjustStanding(s, 'management', 4);
    sfx.levelUp();
    this.journal(`Promoted to ${this.title}. The building will take me more seriously now. Much more seriously.`);
    this.hud.toast(`PROMOTED: ${this.title}. Difficulty ×${this.difficulty.toFixed(2)}.`, 'epic');
    if (domain !== null) this.achieve('promoted');
    if (s.rung >= RUNG_COUNT - 1) this.achieve('architect');
    this.refreshDerived();
  }

  demote(): void {
    const s = this.save;
    s.rung = Math.max(0, s.rung - 1);
    s.warnings = 0;
    this.journal(`Demoted to ${this.title}.`);
    this.hud.toast(`DEMOTED to ${this.title}.`, 'bad');
    this.refreshDerived();
  }

  fireFromJob(): void {
    this.afterDialogue = () => screens.showFired(this);
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
    this.achieve('rune');
    return true;
  }

  trainSkill(k: Skill): void {
    this.bumpSkill(k);
  }

  evidence(): number {
    return evidenceHeld(this);
  }

  runeDiscount(): number {
    return this.save.upgrades.includes('runegarden') ? 0.5 : 1;
  }

  // ================================================================== thin delegations

  hurtPlayer(amount: number, from: Actor | null, kind: 'melee' | 'ticket' | 'meeting' | 'boss' | 'aura' | 'bite'): void {
    hurtPlayer(this, amount, from, kind);
  }

  fire(p: ProjectileSpec): void {
    fire(this, p);
  }

  floatText(pos: THREE.Vector3, text: string, color: string): void {
    floatText(this, pos, text, color);
  }

  hazard(x: number, z: number, radius: number, seconds: number, kind: HazardKind): void {
    spawnHazard(this, x, z, radius, seconds, kind);
  }

  telegraph(t: TelegraphSpec): void {
    spawnTelegraph(this, t);
  }

  /** The rising sound of a wind-up, for anyone close enough to matter; bosses lower. */
  windupCue(a: Actor, seconds: number): void {
    if (Math.hypot(a.pos.x - this.player.pos.x, a.pos.z - this.player.pos.z) < 18) sfx.windup(seconds, a.kind === 'boss');
  }

  healPlayer(amount: number, from: string): void { host.healPlayer(this, amount, from); }
  rootPlayer(seconds: number, reason: string, resistible = true): void { host.rootPlayer(this, seconds, reason, resistible); }
  shake(amount: number): void { this.shakeAmt = Math.max(this.shakeAmt, amount); }
  helperDamageMult(a: Actor): number { return helperMult(this, a); }
  healerFrequency(): number { return host.healerFrequency(this); }
  kitchenStanding(): number { return this.derivedCache.band.healerMult === 0 ? -100 : this.save.standing.kitchen; }
  ticketTitle(a: Actor): string { return TICKETS[a.ticket]?.title ?? 'It is broken'; }
  ticketFix(a: Actor): string { return TICKETS[a.ticket]?.fixes[0] ?? 'Turn it off and on again'; }
  noticed(a: Actor): void { if (this.player.crouching && a.kind !== 'mosquito') this.hud.toast(`${a.name} spotted you.`, 'bad'); }
  bossStart(a: Actor): void { host.bossStart(this, a); }
  bossLeash(a: Actor): void { host.bossLeash(this, a); }
  bossParley(a: Actor): void { host.bossParley(this, a); }
  stealRep(a: Actor, amount: number): number { return host.stealRep(this, a, amount); }
  enqueueTicket(from: Actor, gold: boolean): void { host.enqueueTicket(this, from, gold); }
  giveItem(id: string, n: number, from: string): void { host.giveItem(this, id, n, from); }
  giveAmmo(): void { host.giveAmmo(this); }
  addActionItem(from: string): void { host.addActionItem(this, from); }
  clearActionItems(from: string): number { return host.clearActionItems(this, from); }
  resolvePeacefully(a: Actor, how: 'fix' | 'ticket' | 'scared' | 'charmed' | 'meeting' | 'bribe'): void { host.resolvePeacefully(this, a, how); }
  enrage(a: Actor): void { host.enrage(this, a); }
  recruitedHelper(): Actor | null { return host.recruitedHelper(this); }
  dismiss(a: Actor): void { host.dismiss(this, a); }
  spawnHostile(kind: 'user' | 'manager' | 'reply' | 'customer', n: number, name?: string): void { host.spawnHostile(this, kind, n, name); }
  deliverLaptop(a: Actor): boolean { return host.deliverLaptop(this, a); }
  bossDeal(kind: 'nda' | 'mokki' | 'expose' | 'parachute'): void { host.bossDeal(this, kind); }
  auditorParley(outcome: 'ally' | 'fight'): void { host.auditorParley(this, outcome); }
  // QuestHost
  hasItem(id: string): boolean { return this.save.questItems.includes(id); }
  takeItem(id: string): void { this.save.questItems = this.save.questItems.filter((x) => x !== id); }
  giveUnique(id: string): void { host.giveUnique(this, id); }
  giveRandomGear(rarity: 'fine' | 'rare'): void { host.giveRandomGear(this, rarity); }
  acceptQuest(id: string): void { host.acceptQuest(this, id); }
  questEvent(e: QuestEvent): void { questEvent(this, e); }
  turnHostile(npc: string, name: string): void { host.turnHostile(this, npc, name); }
  recruitIntern(): void { host.recruitIntern(this); }
  atPeak(): boolean { return bandFor(this.save.bac, this.derivedCache.specials.has('flask')) === 'peak'; }
  drinksHere(): number { return this.save.floorState.drinksHere; }
  maybeStaff(by: string, chance: number): void { maybeStaff(this, by, chance); }
  pushBack(index: number): string { return pushBack(this, index); }
  dropMentoring(index: number): string { return dropMentoring(this, index); }
  startQuestStage(st: QuestState): void { startStage(this, st); }
  teamNote(a: Actor): string { return teamNote(a); }
  treatOptions(a: Actor): DialogueOption[] { return treatOptions(this, a); }
  tooTired(a: Actor): boolean { return tooTired(a); }
  // PagerHost
  drinkBand(): Band { return bandFor(this.save.bac, this.derivedCache.specials.has('flask')); }
  // OsHost
  buy(id: string): string | null { return host.buy(this, id); }
  sell(uid: string): string | null { return host.sell(this, uid); }
  price(base: number): number { return host.price(this, base); }
  equipGear(uid: string): void { host.equipGear(this, uid); }
  unequip(slot: 'head' | 'body' | 'feet' | 'trinket'): void { host.unequip(this, slot); }
  use(id: string): void { host.use(this, id); }
  takePerk(id: string): void { host.takePerk(this, id); }
  resolve(q: QueuedTicket, label: string): { ok: boolean; message: string } { return host.resolveTicket(this, q, label); }
  fixOptions(q: QueuedTicket): string[] { return host.fixOptions(this, q); }
  fixHint(q: QueuedTicket): string | null { return host.fixHint(this, q); }
  garble(label: string): string { return host.garble(this, label); }
  pullTickets(): number { return host.pullTickets(this); }
  newQuest(): ReturnType<OsHost['newQuest']> { return host.newQuest(this); }
  claimQuest(q: Parameters<OsHost['claimQuest']>[0]): void { host.claimQuest(this, q); }
  slackOff(): string { return host.slackOff(this); }
  canSlack(): boolean { return this.currentTerminal !== null && !this.slackedTerminals.has(this.currentTerminal.id); }
  hasTerminal(): boolean { return this.currentTerminal !== null; }
  click(): void { sfx.click(); }
  error(): void { sfx.error(); }
  coin(): void { sfx.coin(); }

  // ================================================================== Friday and Monday

  goToMokki(): void {
    const s = this.save;
    screens.transitionTo(this, 'Friday 17:00 - to the mökki', '🌲', 'Three hours up the motorway, the last one on gravel. The phone loses signal at the petrol station. Mostly.', () => {
      // Last week's blessings wear off on the drive; the weekend can grant new ones.
      s.saunaBuff = false;
      s.makkara = false;
      s.hauki = false;
      s.palju = false;
      s.weekend = freshWeekend();
      s.caffeineTol = Math.max(0, s.caffeineTol - 0.25);
      if (this.boss === null || this.boss.resolved) s.floorState.bossDone = true;
      const week = settleWeek(this);
      restTeam(this);
      const pay = Math.round(salaryFor(s.rung) * WORKPLACES[s.workplace].rep);
      s.rep += pay;
      this.loadMokki(false);
      screens.resume(this);
      this.hud.toast(`Salary: +₡${pay} (${this.title}).`, 'epic');
      this.journal(`Weekend ${s.week} at the mökki. Salary ₡${pay}.`);
      startOnCall(this);
      if (week !== '') this.hud.toast(`📌 ${week}`, 'info');
      if (s.upgrades.includes('guestroom')) adjustStanding(s, 'kitchen', 3);
      // Friday evening phone calls: HR first, then Derek with the review.
      const queue: (() => DialogueNode)[] = [];
      if (s.warnings >= 3) queue.push(() => disciplinary(this));
      queue.push(() => performanceReview(this));
      this.chainDialogues(queue);
      this.tip('mokki');
      this.autosave();
    });
  }

  goToWork(): void {
    const s = this.save;
    const next = s.floor + 1;
    s.week += 1;
    const theme = THEMES[next % THEMES.length];
    screens.transitionTo(this, theme?.name ?? '', String(next), 'Monday. The lift plays a pan-pipe cover of a song you used to like.', () => {
      endOnCall(this);
      this.loadFloor(next, false);
      screens.resume(this);
      this.hud.toast(`Welcome to ${this.floorName()}.`, 'epic');
      if (s.upgrades.includes('dog')) this.achieve('dog');
    });
  }

  finishStory(): void {
    const s = this.save;
    screens.showEnding(this, endingFor({ rung: s.rung, dependency: s.dependency, warnings: s.warnings, flags: s.flags, standing: s.standing }));
  }

  levelUpIfReady(): void {
    if (levelUpReady(this.save)) this.openDialogue(levelUpNode(this));
  }

  domainCooldown(): number {
    return domainCooldown(this);
  }

  // ================================================================== upkeep

  private billboards(): void {
    const q = this.camera.quaternion;
    const cam = this.camera.position;
    for (const a of this.actors) {
      if (a.hpBar.visible) a.hpBar.quaternion.copy(a.root.quaternion).invert().multiply(q);
      // Under the steam nobody has anything to say: the vision hides the
      // bubbles, and this must not put them back over the silhouettes.
      if (a.bubble !== null) a.bubble.visible = this.vision === null && Math.hypot(a.pos.x - cam.x, a.pos.z - cam.z) > 3.2;
    }
  }

  /** Behind the title: a slow orbit around wherever the save left you. */
  private titleCamera(t: number): void {
    const c = this.player.pos;
    const a = t * 0.08;
    const r = 5.5;
    const p = new THREE.Vector3(c.x + Math.sin(a) * r, 2.4, c.z + Math.cos(a) * r);
    // Keep the camera out of walls: pull in until the cell is open.
    for (let k = r; k > 1.5; k -= 0.5) {
      p.set(c.x + Math.sin(a) * k, 2.4, c.z + Math.cos(a) * k);
      const cx = toCell(p.x);
      const cz = toCell(p.z);
      if (this.level.floor[cz * this.level.w + cx] === 1 && this.level.opaque[cz * this.level.w + cx] !== 1) break;
    }
    this.camera.position.copy(p);
    this.camera.lookAt(c.x, 1.3, c.z);
    this.player.model.visible = true;
  }

  /** How you feel, on the screen: drink, caffeine, stress, crash, the king of cans. */
  private updateMood(dt: number): void {
    const s = this.save;
    const d = this.derivedCache;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    const ratio = s.sanity / Math.max(1, d.maxSanity);
    const play = this.screen === 'play' || this.screen === 'dialogue' || this.screen === 'os' || this.screen === 'minigame';
    const sway = BAND_EFFECTS[bandFor(s.bac)].sway;
    if (this.vision !== null) this.moodTint.setRGB(1.1, 0.97, 0.82);
    else if (s.location === 'mokki') this.moodTint.setRGB(1.04, 1.0, 0.96);
    else if (s.floor % 5 === 0) this.moodTint.setRGB(0.95, 1.0, 1.06);
    else this.moodTint.setRGB(1, 1, 1);
    this.pipeline.setMood({
      drunk: play ? Math.min(2.5, sway * (d.ultra ? 0.4 : 1)) : 0,
      jitter: play ? d.caffeine.jitter : 0,
      stress: play ? Math.max(0, Math.min(1, (0.4 - ratio) / 0.4)) : 0,
      hangover: s.hangover > 0 && !d.ultra ? 1 : 0,
      crash: s.crash > 0 && !d.ultra ? 1 : 0,
      ultra: d.ultra ? 1 : 0,
      hurt: this.hurtFlash,
    }, this.time, this.moodTint);
    if (this.screen !== 'play') return;
    // Dust in the light, and the white shimmer of the ascended.
    this.dustIn -= dt;
    if (this.dustIn <= 0 && s.location === 'office' && this.vision === null && this.settings.quality !== 'low') {
      this.dustIn = 0.3;
      const p = this.player.pos;
      this.particles.emit('dust', new THREE.Vector3(p.x + fx.range(-5, 5), fx.range(0.6, 2.8), p.z + fx.range(-5, 5)), 2, 1.5);
    }
    if (d.ultra) this.particles.emit('aura', this.player.pos.clone().setY(1.1), 1, 0.5);
    // Server rooms blink.
    const leds = this.level.group.userData.leds as THREE.MeshBasicMaterial[] | undefined;
    if (leds !== undefined) {
      leds.forEach((m, k) => {
        const on = Math.sin(this.time * (3 + k * 2.3) + k) > -0.2 ? 1 : 0.15;
        const base = m.userData.base as number | undefined ?? m.color.getHex();
        m.userData.base = base;
        m.color.setHex(base).multiplyScalar(on);
      });
    }
  }

  private animateScenery(): void {
    if (this.save.location !== 'mokki' || this.level === undefined) return;
    for (const child of this.level.group.children) {
      if (child.name === 'water' && child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        const u = child.material.uniforms.time;
        if (u !== undefined) u.value = this.time;
      }
      if (child.name === 'grass' && child instanceof THREE.InstancedMesh) {
        const t = (child.material as THREE.Material).userData.windTime as { value: number } | undefined;
        if (t !== undefined) t.value = this.time;
      }
      if (child.name === 'sky') child.position.copy(this.camera.position);
      if (child.name === 'smoke') {
        child.children.forEach((c, i) => {
          c.position.y = (this.time * 0.4 + i * 0.5) % 2.5;
          c.position.x = Math.sin(this.time + i) * 0.3;
        });
      }
    }
  }

  markSeen(): void {
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

  /**
   * Do not draw people a wall hides. Every one of them is several draw calls
   * (more again for each shadow map they fall in), and indoors most of the
   * crowd within fog range is in some other room. A person counts as seen if
   * any of three sight lines - to their middle and to either shoulder - misses
   * every wall, so nobody vanishes while still peeking round a door frame.
   */
  private cullHidden(): void {
    if (this.save.location !== 'office') return;
    const cam = this.camera.getWorldPosition(this.camPos);
    const lv = this.level;
    const cx = toCell(cam.x);
    const cz = toCell(cam.z);
    // A camera pushed into a wall (third person, tight corner) sees nothing
    // cleanly: draw everyone rather than guess.
    const inWall = cx < 0 || cz < 0 || cx >= lv.w || cz >= lv.h || (lv.opaque[cz * lv.w + cx] === 1 && lv.floor[cz * lv.w + cx] !== 1);
    const pp = this.player.pos;
    for (const a of this.actors) {
      if (Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) > ACTOR_RANGE) {
        a.root.visible = false;
        continue;
      }
      if (inWall) {
        a.root.visible = true;
        continue;
      }
      const dx = a.pos.x - cam.x;
      const dz = a.pos.z - cam.z;
      const d = Math.hypot(dx, dz) || 1;
      // Perpendicular to the sight line, half a person wide.
      const px = (-dz / d) * SHOULDER;
      const pz = (dx / d) * SHOULDER;
      const seen = !wallBetween(lv, cam.x, cam.z, a.pos.x, a.pos.z)
        || !wallBetween(lv, cam.x, cam.z, a.pos.x + px, a.pos.z + pz)
        || !wallBetween(lv, cam.x, cam.z, a.pos.x - px, a.pos.z - pz);
      a.root.visible = seen;
    }
  }

  updateLights(force: boolean): void {
    if (this.save.location === 'mokki') return;
    this.lightIn -= 1 / 60;
    if (!force && this.lightIn > 0) return;
    this.lightIn = 0.5;
    const pp = this.player.pos;
    const spots = [...this.level.lightSpots].sort((a, b) =>
      Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z));
    this.lights.forEach((l, i) => {
      const spot = spots[i];
      if (spot === undefined || l.userData.enabled === false) {
        l.visible = false;
        return;
      }
      l.visible = true;
      l.position.copy(spot);
      l.intensity = this.save.floor === 0 ? 10 : 16;
      l.castShadow = i === 0 && this.settings.quality === 'high';
    });
    const flick = this.lights[2];
    if (flick !== undefined && fx.chance(0.3)) flick.intensity *= fx.range(0.2, 1);
  }
}
