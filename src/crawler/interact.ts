import * as THREE from 'three';
import { sfx } from './audio';
import { dropGearFrom, steamBurst } from './combat';
import { type DialogueNode, type DialogueOption, said } from './dialogue';
import { type Actor, setMarker, TALKERS } from './entities';
import { FINAL_FLOOR, type Game, type PromptTarget } from './game';
import * as host from './hosts';
import { COLD_LINE, floorLabel, ONLOOKERS, p1Resolved } from './hub';
import { BOOK_IDS, CONSUMABLES, DRINKS, ENERGY_DRINKS, itemById, RUNES } from './items';
import { type Interactable, lineOfSight, toCell } from './level';
import { livePage } from './oncall';
import { answerAtTerminal, carNote, driveOffTag, hasDish, villageOption } from './pager';
import { currentObjective, isActive, QUEST_ITEMS, type QuestEvent, talkGiver } from './quests';
import { questOf } from './questing';
import { mentorRequestNode } from './teamwork';
import { fx } from './rng';
import * as screens from './screens';
import { adjustStanding, perk, skill } from './state';
import {
  disciplinary,
  talkAuditor,
  talkHealer,
  talkHelper,
  talkHostile,
  talkManager,
  talkStory,
  talkTonttu,
} from './story';
import { UPGRADES } from './upgrades';
import { caffeinate } from './vices';

/** What E does, with whatever you are looking at. */

function markUsed(g: Game, it: Interactable): void {
  it.used = true;
  const s = g.save;
  // Kept by the floor (the P1) or by the hub's week, so a reload and the lift keep it used.
  const used = s.location === 'office' ? s.floorState.used : s.location === 'hub' ? s.hub.used : null;
  if (used !== null && !used.includes(it.id)) used.push(it.id);
}

export function findPrompt(g: Game): void {
  const pp = g.player.pos;
  const fwd = new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw));
  let best: PromptTarget = null;
  let bestScore = Infinity;
  // Induction day: a prop answers E only at its own step.
  const day = g.inductionDay;
  for (const it of g.level.interactables) {
    if (day !== null && !day.offersPrompt(it)) continue;
    const dx = it.x - pp.x;
    const dz = it.z - pp.z;
    const dist = Math.hypot(dx, dz);
    const reach = it.kind === 'elevator' || it.kind === 'itdesk' || it.kind === 'car' || it.kind === 'lake' || it.kind === 'dock' ? 3.2 : 2.4;
    if (dist > reach) continue;
    const dot = (dx * fwd.x + dz * fwd.z) / Math.max(dist, 1e-4);
    if (dot < 0.2 && dist > 1.4) continue;
    const score = dist - dot;
    if (score < bestScore) {
      bestScore = score;
      best = { kind: 'interact', it };
    }
  }
  for (const a of g.actors) {
    if (a.resolved) continue;
    const talkable = !a.hostile
      || (a.kind === 'boss' && a.docile)
      || ((TALKERS.includes(a.kind) || a.kind === 'manager') && !a.talked && a.enragedT <= 0);
    if (!talkable || a.role === 'clone' || a.role === 'spirit' || a.role === 'dog') continue;
    if (day !== null && !day.offersPrompt(a)) continue;
    const dx = a.pos.x - pp.x;
    const dz = a.pos.z - pp.z;
    const dist = Math.hypot(dx, dz);
    if (dist > (a.kind === 'boss' ? 4 : 2.6)) continue;
    // Scored like a prop (near and in front wins), so a person facing you
    // beats the lift doors behind them.
    const dot = (dx * fwd.x + dz * fwd.z) / Math.max(dist, 1e-4);
    const score = dist - Math.max(dot, 0.5);
    if (score < bestScore) {
      bestScore = score;
      best = { kind: 'actor', a };
    }
  }
  // ...and the step's own target, in reach, wins over anything else near.
  best = day?.pinnedPrompt() ?? best;
  g.promptTarget = best;
  if (best === null) {
    g.prompt = '';
    return;
  }
  if (best.kind === 'actor') {
    const a = best.a;
    const quest = questOf(a);
    g.prompt = a.hostile ? `E: Talk to ${a.name} (${a.kind === 'manager' ? 'negotiate' : a.kind === 'boss' ? 'parley' : 'talk them down'})`
      : quest !== undefined ? `E: Talk to ${a.name}`
        : a.kind === 'healer' || a.colleague ? `E: Talk to ${a.name}`
          : a.kind === 'tonttu' ? 'E: Talk to the Saunatonttu (runes, training)'
            : a.kind === 'npc' ? `E: Talk to ${a.name}` : `E: ${a.recruited ? 'Talk to' : 'Recruit'} ${a.name}`;
    return;
  }
  const it = best.it;
  const s = g.save;
  const w = s.weekend;
  const saunaMax = s.upgrades.includes('woodshed') ? 2 : 1;
  const paged = s.location === 'mokki' && livePage(s.oncall) !== undefined;
  const labels: Record<Interactable['kind'], string> = {
    terminal: s.location === 'mokki' ? (paged ? 'E: Answer the page (satellite terminal)' : 'E: Remote work terminal (satellite)') : 'E: Log on to WorkgrumbleOS (tickets, tasks, HR, Internal IT)',
    printer: it.used ? 'Printer: READY (for now)' : 'E: Fix the printer',
    cooler: it.used ? 'Water cooler (empty)' : 'E: Water cooler (+sanity, -BAC)',
    coffee: it.used ? 'Coffee machine (descaling)' : 'E: Coffee machine (90 mg)',
    vending: 'E: Vending machine (₡10, mostly cans)',
    itdesk: 'E: Internal IT Service Desk (requisition gear, sell kit)',
    elevator: g.mission ? g.mission.liftPrompt() : liftPrompt(g),
    crate: it.used ? 'Empty spares crate' : 'E: Rummage in the spares crate',
    kiuas: s.location === 'mokki' ? (w.saunas >= saunaMax ? 'The kiuas is cooling (next weekend)' : 'E: Throw löyly (sauna)') : it.used ? 'The kiuas is cooling' : 'E: Throw löyly (sauna)',
    locker: it.used ? 'Supply closet (empty)' : `E: Pick the supply-closet lock (lock ${it.lock})${g.lockerItems.has(it.id) ? ' ◆' : ''}`,
    fridge: it.used ? 'Office fridge (just a yoghurt, and a note)' : 'E: Office fridge',
    pantti: `E: Bottle return (${s.empties} empties)`,
    bed: 'E: Sleep (rest, level up)',
    lake: 'E: Swim in the lake',
    grill: w.grill ? 'The grill is cooling' : 'E: Grill makkara',
    stash: 'E: Your stash chest',
    car: paged && !hasDish(g) ? 'E: The car (the village has Wi-Fi for the page; or back to work)' : 'E: Drive back to work (Monday)',
    runestone: 'E: Read the rune stone',
    board: `E: Plan the farm (${s.upgrades.length}/${UPGRADES.length} built)`,
    dock: w.fish >= 3 ? 'The fish have stopped biting (next weekend)' : 'E: Fish off the end of the laituri',
    patch: w.potatoes ? 'The potatoes are dug' : 'E: Dig new potatoes',
    palju: w.palju ? 'The palju is cooling' : 'E: Soak in the palju',
    bookshelf: w.book ? 'Nothing new on the shelf' : 'E: Browse the reading nook',
  };
  g.prompt = labels[it.kind];
}

/**
 * Stand the player in a cell beside the first unused `kind` here (a kiuas,
 * the lift, the car, a terminal), close and facing it, so a browser test can
 * press E on the real thing. Only a spot where E would reach it (and not,
 * say, somebody standing next to it) counts. It moves only the player; what
 * E does there is the game's. False if there is no such spot.
 */
export function standAt(g: Game, kind: Interactable['kind']): boolean {
  const lv = g.level;
  for (const it of lv.interactables) {
    if (it.kind !== kind || it.used) continue;
    const cx = toCell(it.x);
    const cz = toCell(it.z);
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      if (cx + ox < 0 || cz + oz < 0 || cx + ox >= lv.w || cz + oz >= lv.h) continue;
      const i = (cz + oz) * lv.w + cx + ox;
      if (lv.floor[i] !== 1 || lv.solid[i] === 1) continue;
      // Just inside the neighbouring cell, on the side towards it.
      const x = it.x + ox * 1.4;
      const z = it.z + oz * 1.4;
      g.player.pos.set(x, 0, z);
      g.player.yaw = Math.atan2(ox, oz);
      g.player.pitch = 0;
      findPrompt(g);
      const t = g.promptTarget;
      if (t !== null && t.kind === 'interact' && t.it === it) return true;
    }
  }
  return false;
}

export function interact(g: Game): void {
  const target = g.promptTarget;
  if (target === null) return;
  if (target.kind === 'actor') {
    talkTo(g, target.a);
    return;
  }
  useThing(g, target.it);
}

function talkTo(g: Game, a: Actor): void {
  const s = g.save;
  // Morag and the practice colleague, on induction day.
  if (g.inductionDay?.talk(a) === true) return;
  // Saw you commit a crime on the hub: not this week.
  if (a.cold) {
    g.openDialogue(said(a.name, COLD_LINE, 'bad', 'Leave them be'));
    return;
  }
  if (a.hostile) {
    if (a.kind === 'boss') g.openDialogue(talkAuditor(g, a));
    else g.openDialogue(a.kind === 'manager' ? talkManager(g, a) : talkHostile(g, a));
    return;
  }
  // A colleague on the hub who is not after you: a walk-up's problem, or small talk.
  if (a.colleague && g.hub !== null) {
    g.openDialogue(g.hub.talk(a));
    return;
  }
  // A teammate who came to you with a problem.
  if (g.mentorAsk?.actor === a) {
    g.openDialogue(mentorRequestNode(g, a));
    return;
  }
  const quest = questOf(a);
  if (quest !== undefined) {
    g.openDialogue(talkGiver(g, quest, a.name));
    return;
  }
  if (a.kind === 'healer') {
    // A leaving card or a cake rota counts each of the Kitchen Cabinet once - once it is asked for.
    const sig: QuestEvent = { type: 'talk', npc: 'healer' };
    const wanted = s.questLog.some((q) => isActive(q) && currentObjective(q)?.match?.(sig) === true);
    if (wanted && a.memo.questTalk !== true && s.bac < 65 && s.standing.kitchen > -40) {
      a.memo.questTalk = true;
      g.questEvent(sig);
    }
    // The weekend visitor brings cake and the week's gossip.
    if (s.location === 'mokki' && !s.weekend.visitorDone) {
      s.weekend.visitorDone = true;
      setMarker(a, null);
      g.giveItem('cake', 1, a.name);
      adjustStanding(s, 'kitchen', 2);
    }
    g.openDialogue(talkHealer(g, a));
  } else if (a.kind === 'tonttu') {
    g.openDialogue(talkTonttu(g, a));
  } else if (a.kind === 'npc') {
    g.openDialogue(talkStory(g, a), () => {
      if (a.talked) {
        s.flags[`story_${a.npcId ?? ''}`] = true;
        setMarker(a, null);
      }
    });
  } else {
    g.openDialogue(talkHelper(g, a));
  }
}

function useThing(g: Game, it: Interactable): void {
  const s = g.save;
  switch (it.kind) {
    case 'terminal':
      // On call at the mökki: the page comes first.
      if (answerAtTerminal(g)) break;
      g.currentTerminal = it;
      if (s.warnings >= 3) {
        g.openDialogue(disciplinary(g));
        return;
      }
      if (!g.loggedOn.has(it.id)) {
        g.loggedOn.add(it.id);
        g.questEvent({ type: 'use', what: 'terminal', terminal: it.id });
      }
      g.openOs('desk');
      break;
    case 'itdesk':
      g.openOs('itdesk');
      break;
    case 'cooler':
      if (it.used) {
        g.hud.toast('Empty. Somebody should change the bottle. It will not be you.');
        break;
      }
      markUsed(g, it);
      s.bac = Math.max(0, s.bac - 8);
      s.caffeine *= 0.8;
      g.healPlayer(25, 'Water cooler');
      break;
    case 'coffee': {
      if (it.used) {
        g.hud.toast('"DESCALING IN PROGRESS". It has said that since 2019.');
        break;
      }
      markUsed(g, it);
      const c = CONSUMABLES.find((x) => x.id === 'coffee');
      s.energy = 100;
      if (c !== undefined) caffeinate(g, c);
      sfx.heal();
      g.hud.toast('Fresh filter coffee. Energy full, pep in step. (90 mg)', 'good');
      g.tip('caffeine');
      break;
    }
    case 'vending': {
      if (s.rep < 10) {
        sfx.error();
        g.hud.toast('Insufficient Rep. The machine judges you.', 'bad');
        break;
      }
      s.rep -= 10;
      sfx.coin();
      // Very, very occasionally the machine drops the king.
      if (g.lootRng.chance(0.015)) {
        g.giveItem('whitemonster', 1, 'The vending machine');
        g.hud.toast('⚪ JACKPOT. The machine rattles and drops... a WHITE MONSTER. People gather. Somebody films it.', 'epic');
        break;
      }
      g.giveItem(g.lootRng.pick(['euroshopper', 'euroshopper', 'redbull', 'monster', 'battery', 'energy', 'biscuits', 'fazer', 'salmiakkibag']), 1, 'The vending machine');
      break;
    }
    case 'printer':
      if (it.used) {
        g.hud.toast('READY. For now.');
        break;
      }
      markUsed(g, it);
      sfx.resolved();
      g.hud.toast('You open every tray, remove one crumpled sheet, and turn it off and on again. READY.', 'good');
      g.addRep(15);
      adjustStanding(s, 'itcrowd', 3);
      g.exercise('troubleshooting', 1);
      host.mailProgress(g, 'printer');
      g.questEvent({ type: 'use', what: 'printer' });
      break;
    case 'crate':
      if (it.used) {
        g.hud.toast('Just some SCSI terminators and a Zip drive.');
        break;
      }
      markUsed(g, it);
      g.giveAmmo();
      g.addRep(20);
      adjustStanding(s, 'itcrowd', 1);
      g.giveItem(fx.pick(['biscuits', 'coffee', 'battery', 'postit', 'paperclip']), 1, '');
      if (g.lootRng.chance(0.3)) dropGearFrom(g, new THREE.Vector3(it.x, 0, it.z));
      break;
    case 'elevator':
      // On a mission card the lift closes the card (or aborts it).
      if (g.mission) {
        g.mission.lift();
        break;
      }
      // Induction day: Morag has the new starter until the floor is awake
      // (the block and parry done). After that the lift works, and taking it
      // abandons the rest of the morning (`inductionOnLoad`).
      if (g.inductionDay !== null && !g.floorAwake) {
        sfx.error();
        g.hud.toast('Morag: "The lift will still be there after your induction. Finish the card first."', 'info');
        break;
      }
      g.openDialogue(liftNode(g));
      break;
    case 'kiuas':
      sauna(g, it);
      break;
    case 'locker':
      pickLock(g, it);
      break;
    case 'fridge':
      if (it.used) {
        g.hud.toast('Just the yoghurt now. And the note.');
        break;
      }
      g.openDialogue(fridgeNode(g, it));
      break;
    case 'pantti': {
      if (s.empties <= 0) {
        g.hud.toast('No empties. The machine beeps, disappointed.');
        break;
      }
      const n = s.empties;
      s.empties = 0;
      s.rep += n * 2;
      s.stats.cans += n;
      sfx.coin();
      g.hud.toast(`Pantti: ${n} empties returned, ₡${n * 2}. The evidence is gone.`, 'good');
      g.refreshDerived();
      break;
    }
    case 'bed':
      host.rest(g, true);
      break;
    case 'lake':
      swim(g);
      break;
    case 'grill':
      if (s.weekend.grill) {
        g.hud.toast('The coals are grey. Next weekend.');
        break;
      }
      s.weekend.grill = true;
      g.giveItem('makkara', s.upgrades.includes('woodshed') ? 4 : 2, 'The grill');
      g.giveItem('lonkero', 1, 'The cool box');
      sfx.hiss();
      break;
    case 'stash':
      g.openDialogue(stashNode(g));
      break;
    case 'car': {
      // On call with no dish, the car is also the way to the village Wi-Fi.
      const village = villageOption(g);
      const tag = driveOffTag(g);
      g.openDialogue({
        speaker: 'The car', text: `Monday morning. Three hours back down the motorway. Ready?${carNote(g)}`,
        options: [
          ...(village === null ? [] : [village]),
          { label: 'Drive back to work.', ...(tag === null ? {} : { tag }), pick: () => { g.afterDialogue = () => g.goToWork(); return null; } },
          { label: village === null ? 'Five more minutes.' : 'Not yet.', leave: true, pick: () => null },
        ],
      });
      break;
    }
    case 'runestone': {
      const t = g.actors.find((a) => a.kind === 'tonttu');
      if (t !== undefined) g.openDialogue(talkTonttu(g, t));
      else g.hud.toast('The runes glow faintly. The tonttu is out.');
      break;
    }
    case 'board':
      g.openDialogue(boardNode(g));
      break;
    case 'dock':
      fish(g);
      break;
    case 'patch':
      if (s.weekend.potatoes) {
        g.hud.toast('Already dug this weekend. They need a week.');
        break;
      }
      s.weekend.potatoes = true;
      g.giveItem('potatoes', 3, 'The potato patch');
      g.exercise('athletics', 1);
      break;
    case 'palju':
      if (s.weekend.palju) {
        g.hud.toast('The palju needs hours to heat up again.');
        break;
      }
      s.weekend.palju = true;
      s.palju = true;
      s.bac = Math.max(0, s.bac - 15);
      g.healPlayer(40, 'The palju');
      steamBurst(g, g.player.pos.clone(), 1.5);
      sfx.splash();
      g.hud.toast('You soak in the palju under the white night until your fingers wrinkle. +15% max sanity for the week.', 'epic');
      g.refreshDerived();
      break;
    case 'bookshelf': {
      if (s.weekend.book) {
        g.hud.toast('You have read everything new on the shelf. Next weekend.');
        break;
      }
      s.weekend.book = true;
      const unread = BOOK_IDS.filter((b) => !s.booksRead.includes(b));
      g.giveItem(fx.pick(unread.length > 0 ? unread : BOOK_IDS), 1, 'The reading nook');
      break;
    }
  }
}

// ================================================================== the lift

/** What E on the lift says it will do. */
function liftPrompt(g: Game): string {
  if (g.inductionDay !== null && !g.floorAwake) return 'The lift (after your induction)';
  const friday = g.elevatorOpen ? ', or Friday' : '';
  return g.save.location === 'hub' ? `E: Take the lift - floor ${floorLabel(g.save.floor)}, the major incident${friday}` : `E: Take the lift - back to the hub${friday}`;
}

/**
 * The lift's buttons. On the hub: up to the week's P1 floor, always, and
 * Friday once the P1 is resolved. On the P1 floor: back down to the hub,
 * always, and Friday once its boss is resolved. Friday on the last floor of
 * the story is the ending.
 */
export function liftNode(g: Game): DialogueNode {
  const s = g.save;
  const hub = s.location === 'hub';
  const friday = hub ? p1Resolved(s) : g.elevatorOpen;
  const go = (then: () => void): (() => null) => () => {
    g.afterDialogue = then;
    return null;
  };
  const options: DialogueOption[] = [
    hub
      ? { label: `Floor ${floorLabel(s.floor)}: the major incident`, pick: go(() => g.liftToP1()) }
      : { label: 'Back to the hub', pick: go(() => g.liftToHub()) },
  ];
  if (friday) {
    options.push({ label: 'Friday: to the mökki', pick: go(() => {
      g.autosave();
      if (s.floor === FINAL_FLOOR && !s.won) g.finishStory();
      else g.goToMokki();
    }) });
  }
  options.push({ label: 'Not yet.', leave: true, pick: () => null });
  const boss = hub ? null : g.boss;
  const status = friday ? 'The major incident is resolved: Friday is a button away.'
    : `The major incident is still open${boss !== null && !boss.resolved ? `: ${boss.name} is in the corner office` : ''}. Friday waits until it is resolved.`;
  return { speaker: 'The lift', subtitle: hub ? 'The hub' : g.floorName(), text: `A pan-pipe cover of something you used to like. ${status}`, options };
}

// ================================================================== the sauna and the lake

function sauna(g: Game, it: Interactable): void {
  const s = g.save;
  const mokki = s.location === 'mokki';
  const max = s.upgrades.includes('woodshed') ? 2 : 1;
  if (mokki ? s.weekend.saunas >= max : it.used) {
    g.hud.toast('The kiuas needs time to heat up again.');
    return;
  }
  if (mokki) s.weekend.saunas += 1;
  else markUsed(g, it);
  const d = g.derivedCache;
  const mult = s.sign === 'juhannus' ? 2 : 1;
  sfx.hiss();
  steamBurst(g, g.player.pos.clone(), 3);
  s.sanity = Math.min(d.maxSanity, s.sanity + d.maxSanity * 0.6 * mult);
  // The mökki's own sauna fills you whatever you had; an office one gives 40.
  const loylyBefore = s.loyly;
  const loylyGain = mokki ? d.maxLoyly : 40 * mult;
  s.loyly = Math.min(d.maxLoyly, s.loyly + loylyGain);
  s.bac = Math.max(0, s.bac - 40);
  s.stomach *= 0.3;
  s.hangover = 0;
  s.dependency = Math.max(0, s.dependency - 6);
  s.caffeine *= 0.7;
  g.saunaT = 90;
  // The smoke sauna blesses you without the lake.
  if (mokki && s.upgrades.includes('savusauna')) s.saunaBuff = true;
  g.exercise('sisu', 2);
  g.exercise('runecraft', 1);
  g.achieve('sauna');
  g.questEvent({ type: 'use', what: 'kiuas' });
  g.refreshDerived();
  g.hud.toast(mokki ? 'Löylyä! Everything restored. Now the lake - while you are still hot.' : 'Löylyä! Sanity and Löyly restored, BAC down, hangover gone.', 'epic');
  g.journal(mokki ? 'Sauna at the mökki. Some things are simply right.' : 'Found a sauna in the office and used it. Building regulations are a mystery.');
  if (!mokki) g.tip('sauna');
  g.steamOverflow('sauna', loylyBefore, loylyGain);
}

function swim(g: Game): void {
  const s = g.save;
  sfx.splash();
  g.particles.emit('splash', g.player.pos.clone().setY(0.4), 40, 0.6);
  steamBurst(g, g.player.pos.clone(), 1);
  if (g.saunaT > 0 && !s.weekend.lake) {
    s.weekend.lake = true;
    s.saunaBuff = true;
    g.hud.toast('SAUNA → LAKE. The Finnish way. Löyly-blessed: +25% damage for the whole next floor.', 'epic');
    g.journal('Sauna, then straight into the lake. Blessed for the week.');
    g.exercise('sisu', 3);
    g.achieve('avanto');
  } else {
    g.hud.toast('Brr! The lake is 14 degrees. Sober, at least. (Try it straight after the sauna.)', 'info');
  }
  s.bac = Math.max(0, s.bac - 25);
  s.stomach *= 0.5;
  s.hangover = 0;
  g.refreshDerived();
}

function fish(g: Game): void {
  const s = g.save;
  if (s.weekend.fish >= 3) {
    g.hud.toast('Nothing is biting. They know you now.');
    return;
  }
  g.screen = 'minigame';
  g.input.enabled = false;
  g.input.releaseLock();
  g.fishing.start(skill(s, 'athletics') * 0.004 + s.attrs.patience * 0.003, (f) => {
    s.weekend.fish += 1;
    if (f !== null) {
      s.stats.fish++;
      g.giveItem(f.id, 1, 'The lake');
      if (f.id === 'fish-hauki') g.achieve('fish');
      g.exercise('athletics', 1);
    } else {
      g.hud.toast('It got away. They always get away.', 'info');
    }
    screens.resume(g);
  });
}

// ================================================================== temptations

function witnesses(g: Game, range: number, kinds: readonly Actor['kind'][]): Actor[] {
  if (g.player.crouching && perk(g.save, 'socialeng') > 0) return [];
  // On a mission only someone with you in their cone sees anything.
  if (g.mission) return g.mission.witnesses(range, kinds);
  const pp = g.player.pos;
  // On the hub everyone neutral can see a crime: the ones who would not fight you go cold instead (hub.ts).
  const who = g.hub !== null ? [...kinds, ...ONLOOKERS] : kinds;
  return g.actors.filter((a) => !a.resolved && !a.recruited && who.includes(a.kind)
    && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < range
    && lineOfSight(g.level, a.pos.x, a.pos.z, pp.x, pp.z));
}

function fridgeNode(g: Game, it: Interactable): DialogueNode {
  const s = g.save;
  const seen = witnesses(g, 10, ['user', 'caller', 'manager', 'healer', 'customer']);
  return {
    speaker: 'The office fridge',
    text: `A yoghurt from 2023. A note: "THIS IS JUKKA'S. DO NOT TOUCH." Behind it: two cans of lonkero and a Koskenkorva miniature.${seen.length > 0 ? ` ${seen.length} ${seen.length === 1 ? 'person is' : 'people are'} watching.` : ' Nobody is looking.'}`,
    options: [
      {
        label: 'Take Jukka\'s drinks.',
        tag: seen.length > 0 ? 'Theft, witnessed' : 'Theft',
        pick: () => {
          markUsed(g, it);
          g.giveItem('lonkero', 2, 'The fridge');
          g.giveItem('kossu', 1, 'The fridge');
          if (seen.length > 0) {
            adjustStanding(s, 'staff', -4);
            adjustStanding(s, 'kitchen', -6);
            g.warn('Seen stealing from the office fridge');
            g.hub?.witnessed(seen, 'take Jukka\'s drinks from the fridge');
            return said('Somebody behind you', 'Is that JUKKA\'S? I am telling Denise.', 'bad');
          }
          g.exercise('stealth', 2);
          return said('The office fridge', 'The door closes with a guilty little thud. Nobody saw.', 'neutral');
        },
      },
      { label: 'Leave it.', leave: true, pick: () => null },
    ],
  };
}

function pickLock(g: Game, it: Interactable): void {
  const s = g.save;
  if (it.used) {
    g.hud.toast('Empty. Somebody got here first. You.');
    return;
  }
  if ((s.consumables.paperclip ?? 0) <= 0) {
    sfx.error();
    g.hud.toast('You need a paperclip. Internal IT has boxes of them.', 'bad');
    return;
  }
  const seen = witnesses(g, 9, ['user', 'caller', 'customer', 'manager', 'consultant', 'vendor', 'shadowit']);
  g.screen = 'dialogue';
  g.input.enabled = false;
  g.input.releaseLock();
  const zone = perk(s, 'masterkey') > 0 ? 1.5 : 1;
  g.lockpick.start(it.lock, skill(s, 'security') + Math.floor(s.attrs.reflex / 5), () => s.consumables.paperclip ?? 0, () => {
    if (perk(s, 'savant') > 0 && fx.chance(0.5)) {
      g.hud.toast('The pin slips, but the paperclip survives.', 'info');
    } else {
      s.consumables.paperclip = Math.max(0, (s.consumables.paperclip ?? 1) - 1);
      if ((s.consumables.paperclip ?? 0) <= 0) delete s.consumables.paperclip;
      sfx.snap();
    }
    g.exercise('security', 0.5);
  }, (ok) => {
    if (ok) {
      markUsed(g, it);
      s.stats.locks++;
      g.exercise('security', 2 + it.lock / 25);
      sfx.lockClick();
      g.achieve('lock');
      lootLocker(g, it);
      g.questEvent({ type: 'use', what: 'locker' });
      if (seen.length > 0) {
        adjustStanding(s, 'staff', -4);
        g.warn(`${seen[0]?.name ?? 'Someone'} saw you breaking into a supply closet`);
        // On a mission a witnessed crime makes the witnesses Alert; on the hub, after you for the week.
        g.mission?.crime(seen);
        g.hub?.witnessed(seen, 'break into a supply closet');
      }
    }
    g.refreshDerived();
    screens.resume(g);
  }, zone);
}

function lootLocker(g: Game, it: Interactable): void {
  const s = g.save;
  const r = g.lootRng;
  const got: string[] = [];
  const give = (id: string, n = 1): void => {
    s.consumables[id] = (s.consumables[id] ?? 0) + n;
    got.push(itemById(id)?.name ?? id);
  };
  const quest = g.lockerItems.get(it.id);
  if (quest !== undefined && !s.questItems.includes(quest)) {
    g.lockerItems.delete(it.id);
    if (!s.questItems.includes(quest)) s.questItems.push(quest);
    if (!s.floorState.picked.includes(quest)) s.floorState.picked.push(quest);
    got.push(QUEST_ITEMS[quest]?.name ?? quest);
    g.questEvent({ type: 'pickup', item: quest });
  }
  give(r.pick(['paperclip', 'postit', 'coffee', 'fazer', 'korvapuusti', ...ENERGY_DRINKS.slice(0, 5)]), r.int(1, 3));
  if (r.chance(0.5)) give(r.pick(['beer', 'lonkero', 'kossu', 'salmari', 'sahti']));
  if (r.chance(0.05)) give('whitemonster');
  const unknown = RUNES.filter((id) => {
    const c = CONSUMABLES.find((x) => x.id === id);
    return c?.rune !== undefined && !s.spells.includes(c.rune) && (s.consumables[id] ?? 0) === 0;
  });
  if (unknown.length > 0 && r.chance(0.35)) give(r.pick(unknown));
  if (r.chance(0.15)) give(r.pick(BOOK_IDS));
  const rep = r.int(10, 30) + s.floor * 10;
  s.rep += rep;
  // Harder locks guard better things.
  if (r.chance(0.2 + it.lock / 250)) dropGearFrom(g, g.player.pos.clone(), r.chance(0.04 + it.lock / 1500) ? 'legendary' : it.lock > 50 ? 'rare' : 'fine');
  g.hud.toast(`Supply closet: ${got.join(', ')} and ₡${rep}.`, 'good');
}

function stashNode(g: Game): DialogueNode {
  const s = g.save;
  const move = (from: Record<string, number>, to: Record<string, number>, filter: (id: string) => boolean): number => {
    let n = 0;
    for (const [id, count] of Object.entries(from)) {
      if (!filter(id) || count <= 0) continue;
      to[id] = (to[id] ?? 0) + count;
      delete from[id];
      n += count;
    }
    g.refreshDerived();
    return n;
  };
  const isDrink = (id: string): boolean => DRINKS.includes(id);
  const isSupply = (id: string): boolean => !DRINKS.includes(id) && id !== 'laptop' && id !== 'paperclip' && id !== 'whitemonster';
  const stored = Object.values(s.stash).reduce((a, b) => a + b, 0);
  return {
    speaker: 'Your stash chest', text: `An old pine chest on the porch. It holds ${stored} thing${stored === 1 ? '' : 's'}. Nothing in here counts toward your carry weight - or tempts you on a Tuesday.`,
    options: [
      { label: 'Put all my drinks in the chest. (Out of reach, out of mind.)', pick: () => { const n = move(s.consumables, s.stash, isDrink); return said('Your stash chest', `${n} drinks stored.`); } },
      { label: 'Take my drinks back out.', pick: () => { const n = move(s.stash, s.consumables, isDrink); return said('Your stash chest', `${n} drinks taken.`); } },
      { label: 'Store my supplies.', pick: () => { const n = move(s.consumables, s.stash, isSupply); return said('Your stash chest', `${n} supplies stored.`); } },
      { label: 'Take my supplies back.', pick: () => { const n = move(s.stash, s.consumables, isSupply); return said('Your stash chest', `${n} supplies taken.`); } },
      { label: 'Close the lid.', leave: true, pick: () => null },
    ],
  };
}

/** The farm, one upgrade at a time. */
function boardNode(g: Game): DialogueNode {
  const s = g.save;
  const opts: DialogueOption[] = UPGRADES.map((u): DialogueOption => {
    const owned = s.upgrades.includes(u.id);
    const blocked = u.requires !== undefined && !s.upgrades.includes(u.requires);
    return {
      label: `${u.name} - ${u.desc}`,
      tag: owned ? 'Built' : blocked ? `needs ${UPGRADES.find((x) => x.id === u.requires)?.name ?? u.requires}` : `₡${u.price}`,
      disabled: owned || blocked || s.rep < u.price,
      pick: () => {
        s.rep -= u.price;
        s.upgrades.push(u.id);
        sfx.coin();
        g.journal(`Built at the mökki: ${u.name}.`);
        if (s.upgrades.length >= 5) g.achieve('mokki');
        g.afterDialogue = () => {
          // The neighbour and his cousin put it up while you watch.
          const at = g.player.pos.clone();
          const yaw = g.player.yaw;
          g.loadMokki(true);
          g.player.pos.copy(at);
          g.player.yaw = yaw;
          g.hud.toast(`${u.name} built.`, 'epic');
          g.autosave();
        };
        return said('The neighbour', u.id === 'dog' ? 'Here he is. Musti. He already likes you more than me.' : 'Me and my cousin will have it up by sauna time. Cash is fine.', 'good', 'Watch them build it');
      },
    };
  });
  opts.push({ label: 'Not this weekend.', leave: true, pick: () => null });
  return { speaker: 'The upgrade board', subtitle: `₡${s.rep} to spend`, text: 'A corkboard on the porch, covered in sketches and a price list from the neighbour, who "knows a guy".', options: opts, mood: 'good' };
}
