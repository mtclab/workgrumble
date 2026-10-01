import type { ReleaseNote } from '../world/releases';
import { sfx } from './audio';
import { showWhatsNew } from './changelog';
import { showCharGen } from './chargen';
import { DEATH_LINES } from './content/lines';
import type { Game } from './game';
import { burnoutMenu, controlsGrid, MENU_LABEL, type MenuItem, type MenuSpec, pauseMenu, titleMenu } from './menus';
import { focusables } from './menukeys';
import { HELLDESK_VERSION, helldeskReleasesNewestFirst } from './releases';
import { fx } from './rng';
import { type Ending, WORKPLACES } from './rpg';
import { deleteSlot, latestSlot, listSlots, SLOT_LABEL, type SlotId, timeAgo } from './saves';
import { saveSettings } from './settings';
import { adjustStanding } from './state';
import { SUO_LINES } from './suo';

/** The full-screen overlays: title, load menu, pause, burnout, endings, lifts. */

type Button = [string, () => void];

interface OverlayOptions {
  /** A menu: the buttons stacked top to bottom, the way the arrow keys walk them. */
  readonly menu?: boolean;
  /** The quiet maker's mark at the foot of the screen. */
  readonly mark?: boolean;
  /** What Esc does here; left out, Esc does nothing (see `SAFE_ESCAPES`). */
  readonly escape?: (() => void) | undefined;
  /** The control focused on open; left out, the first button (the default). */
  readonly focus?: HTMLElement | null;
}

/** A menu's buttons from its spec: the labels and order are the spec's, the actions the screen's. */
function fromSpec(spec: MenuSpec, act: Readonly<Record<MenuItem, (() => void) | undefined>>, label: Partial<Record<MenuItem, string>> = {}): Button[] {
  return spec.items.flatMap((id): Button[] => {
    const fn = act[id];
    return fn === undefined ? [] : [[label[id] ?? MENU_LABEL[id], fn]];
  });
}

/** What Esc does on a spec'd menu: its one safe item, or nothing. */
function escapeOf(spec: MenuSpec, act: Readonly<Record<MenuItem, (() => void) | undefined>>): (() => void) | undefined {
  return spec.escape === null ? undefined : act[spec.escape];
}

const NO_ACTIONS: Readonly<Record<MenuItem, undefined>> = {
  continue: undefined, new: undefined, load: undefined, save: undefined, settings: undefined, controls: undefined, whatsnew: undefined,
  resume: undefined, inventory: undefined, character: undefined, title: undefined, clockin: undefined,
};

export function setOverlay(g: Game, html: string, buttons: Button[], extra?: HTMLElement, o: OverlayOptions = {}): void {
  g.overlay.classList.toggle('is-title', g.screen === 'title');
  // The menu has the keyboard: behind it the game hears nothing (Space
  // presses the focused button, it does not jump; Esc on the pause menu
  // resumes, it does not reach the game and pause it again).
  g.input.enabled = false;
  g.overlay.innerHTML = html;
  if (extra !== undefined) g.overlay.append(extra);
  const row = document.createElement('div');
  row.className = o.menu === true ? 'screen-buttons is-menu' : 'screen-buttons';
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
  g.overlay.append(row);
  if (o.mark === true) {
    const mark = document.createElement('div');
    mark.className = 'maker-mark';
    mark.textContent = 'Built by MTC Lab';
    g.overlay.append(mark);
  }
  g.overlay.style.display = 'flex';
  g.menuKeys.open(o.focus ?? row.querySelector('button'), o.escape ?? null);
}

export function hideOverlay(g: Game): void {
  g.menuKeys.close();
  g.overlay.style.display = 'none';
  g.overlay.replaceChildren();
}

/**
 * A panel over the title or the pause menu (Settings, Controls & help): an
 * OS window in the middle of the screen, modal while it is up. Done, the
 * close box and Esc all take it down and put the focus back where it was.
 */
function openPanel(g: Game, title: string, testid: string, body: HTMLElement, onClose?: () => void): void {
  const opener = document.activeElement instanceof HTMLElement && g.overlay.contains(document.activeElement) ? document.activeElement : null;
  g.overlay.querySelector('.title-panel')?.remove();
  // One panel at a time: the release notes keep keys of their own.
  g.overlay.querySelector('.whats-new')?.remove();
  const panel = document.createElement('section');
  panel.className = 'title-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  panel.setAttribute('data-testid', testid);
  const head = document.createElement('div');
  head.className = 'os-title';
  const name = document.createElement('span');
  name.textContent = title;
  const x = document.createElement('button');
  x.className = 'os-x';
  x.textContent = '✕';
  x.setAttribute('aria-label', 'Close');
  head.append(name, x);
  body.classList.add('os-body');
  const row = document.createElement('div');
  row.className = 'screen-buttons';
  const done = document.createElement('button');
  done.className = 'screen-btn';
  done.textContent = 'Done';
  row.append(done);
  panel.append(head, body, row);
  const close = (): void => {
    onClose?.();
    panel.remove();
    g.menuKeys.closePanel();
    opener?.focus({ preventScroll: true });
  };
  for (const b of [x, done]) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      close();
    });
  }
  g.overlay.append(panel);
  g.menuKeys.openPanel(panel, close, focusables(body)[0] ?? done);
}

/**
 * Settings before any game exists: the Control Panel's own settings (the same
 * code the desks and the backpack use), with no career to resign from.
 * Every change is kept at once, so New career starts with it.
 */
function openSettingsPanel(g: Game): void {
  openPanel(g, 'Settings', 'settings-panel', g.os.settingsPanel(), () => g.os.releasePanel());
}

/** The controls that matter on day one (with this player's keys), then the rest of Help. */
function openControlsPanel(g: Game): void {
  const body = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'title-controls';
  grid.setAttribute('data-testid', 'controls-grid');
  for (const [key, what] of controlsGrid(g.settings.keys)) {
    const cell = document.createElement('span');
    const cap = document.createElement('kbd');
    cap.textContent = key;
    cell.append(cap, ` ${what}`);
    grid.append(cell);
  }
  body.append(grid, g.os.helpPanel());
  openPanel(g, 'Controls & help', 'controls-panel', body);
}

/** Every release, on demand: the same panel boot shows when something is new. */
function openReleases(g: Game): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  g.overlay.querySelector('.title-panel')?.remove();
  g.menuKeys.closePanel();
  g.overlay.querySelector('.whats-new')?.remove();
  showWhatsNew(g.overlay, helldeskReleasesNewestFirst(), {
    lede: 'Every release, newest first. Update History, on any desk and in the backpack, keeps the same list.',
    onClose: () => opener?.focus({ preventScroll: true }),
  });
}

/**
 * `news` is what boot decided to announce (`takeWhatsNew`). Only boot passes
 * it: every later return to the title (retiring, the pause menu) is the same
 * visit, and the panel has been shown or closed already.
 */
export function showTitle(g: Game, news: readonly ReleaseNote[] = []): void {
  g.screen = 'title';
  g.input.releaseLock();
  const latest = latestSlot();
  const meta = latest === null ? undefined : listSlots().find((m) => m.id === latest);
  const spec = titleMenu({ latest: latest !== null && meta !== undefined, saves: listSlots().length > 0 });
  const buttons = fromSpec(spec, {
    ...NO_ACTIONS,
    continue: () => { if (latest !== null) g.loadSlot(latest); },
    new: () => showChargen(g),
    load: () => showLoadMenu(g, () => showTitle(g)),
    settings: () => openSettingsPanel(g),
    controls: () => openControlsPanel(g),
    whatsnew: () => openReleases(g),
  }, meta === undefined ? {} : { continue: `Continue: ${meta.name}, ${meta.title} (${meta.where})` });
  setOverlay(g, `
    <div class="title-logo">WORKGRUMBLE</div>
    <div class="title-sub">H E L L D E S K</div>
    <p class="title-blurb">An IT career role-playing game. Start as an IT Trainee, climb twelve rungs to Senior Architect - or don't.
    Resolve the users, survive the managers and the consultants, keep the office ladies sweet, walk the tightropes of Friday drinks and
    energy cans, uncover Project Phoenix, and spend every weekend building up the mökki and learning the old sauna magic.</p>
    <div class="title-version" data-testid="title-version">Helldesk ${HELLDESK_VERSION}</div>`, buttons, undefined, { menu: true, mark: true });
  showWhatsNew(g.overlay, news);
}

export function showLoadMenu(g: Game, back: () => void): void {
  const slots = listSlots().sort((a, b) => b.savedAt - a.savedAt);
  const list = document.createElement('div');
  list.className = 'screen-slots';
  for (const m of slots) {
    const b = document.createElement('button');
    b.className = 'screen-slot';
    b.innerHTML = '<b></b><span></span>';
    (b.children[0] as HTMLElement).textContent = `${SLOT_LABEL[m.id]}: ${m.name}, ${m.title}, level ${m.level}`;
    (b.children[1] as HTMLElement).textContent = `${m.where} · ${timeAgo(m.savedAt)}`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.unlock();
      g.loadSlot(m.id);
    });
    list.append(b);
  }
  if (slots.length === 0) list.textContent = 'Nothing saved yet.';
  // The newest save has the focus: Enter loads it. Esc goes back.
  setOverlay(g, '<div class="title-logo small">LOAD</div>', [['Back', back]], list, { escape: back, focus: list.querySelector('button') });
}

function showSaveMenu(g: Game): void {
  const list = document.createElement('div');
  list.className = 'screen-slots';
  const existing = new Map(listSlots().map((m) => [m.id, m]));
  for (const id of ['slot1', 'slot2', 'slot3'] as SlotId[]) {
    const m = existing.get(id);
    const b = document.createElement('button');
    b.className = 'screen-slot';
    b.innerHTML = '<b></b><span></span>';
    (b.children[0] as HTMLElement).textContent = `${SLOT_LABEL[id]}: ${m === undefined ? '(empty)' : `${m.name}, ${m.title}`}`;
    (b.children[1] as HTMLElement).textContent = m === undefined ? '' : `${m.where} · ${timeAgo(m.savedAt)} · click to overwrite`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = g.writeSlotFor(id);
      g.hud.toast(ok ? `Saved to ${SLOT_LABEL[id]}.` : 'Could not save: this browser is not keeping anything.', ok ? 'good' : 'bad');
      showPause(g);
    });
    b.dataset.empty = String(m === undefined);
    list.append(b);
  }
  // The focus starts on an empty slot, or on Back: Enter never overwrites a save the player did not pick.
  setOverlay(g, '<div class="title-logo small">SAVE</div>', [['Back', () => showPause(g)]], list, {
    escape: () => showPause(g),
    focus: list.querySelector<HTMLElement>('button[data-empty="true"]'),
  });
}

export function showChargen(g: Game): void {
  g.screen = 'chargen';
  hideOverlay(g);
  g.input.enabled = false;
  showCharGen(g.mount, (setup, skip) => g.beginCareer(setup, skip), () => showTitle(g), {
    skipByDefault: g.settings.inductionDone,
    moreOpen: g.settings.starterMore,
    onMoreToggle: (open) => {
      g.settings.starterMore = open;
      saveSettings(g.settings);
    },
  });
}

export function startPlay(g: Game): void {
  sfx.unlock();
  sfx.boot();
  hideOverlay(g);
  g.screen = 'play';
  g.input.enabled = true;
  g.input.requestLock();
  g.hud.toast(`${g.floorName()}.`, 'info');
}

export function showPause(g: Game): void {
  g.screen = 'paused';
  const s = g.save;
  // Under the steam nothing is saved and the office's computer does not
  // open (it is the backpack too); loading, or the title screen, ends the
  // vision.
  const under = g.vision !== null;
  const spec = pauseMenu({ ironman: s.ironman, vision: under });
  const act = {
    ...NO_ACTIONS,
    resume: () => resume(g),
    save: () => showSaveMenu(g),
    load: () => showLoadMenu(g, () => showPause(g)),
    inventory: () => g.openOs('pack', 'inventory'),
    character: () => g.openOs('pack', 'character'),
    settings: () => g.openOs('pack', 'settings'),
    controls: () => openControlsPanel(g),
    title: () => { g.abortVision(); g.autosave(); showTitle(g); },
  };
  const blurb = under
    ? `<p class="title-blurb suo-pause">${SUO_LINES.noSave}</p>`
    : `<p class="title-blurb">Taking a "comfort break". The SLA clocks are paused. Probably.${s.ironman ? ' <b>IRONMAN</b>: the building saves for you.' : ''}</p>`;
  setOverlay(g, `<div class="title-logo small">PAUSED</div>
    ${blurb}`, fromSpec(spec, act), undefined, { menu: true, mark: true, escape: escapeOf(spec, act) });
}

export function resume(g: Game): void {
  hideOverlay(g);
  g.screen = 'play';
  g.input.enabled = true;
  g.input.requestLock();
}

export function showDead(g: Game): void {
  g.screen = 'dead';
  g.input.releaseLock();
  sfx.error();
  const s = g.save;
  if (s.ironman) {
    showCareerOver(g);
    return;
  }
  const lost = Math.floor(s.rep * WORKPLACES[s.workplace].burnoutLoss);
  s.rep -= lost;
  s.stats.burnouts++;
  adjustStanding(s, 'management', -5);
  g.journal('I burned out. HR sent a wellbeing webinar link.');
  // The penalty is saved at once, so reloading cannot dodge it.
  s.sanity = g.derivedCache.maxSanity;
  s.energy = 100;
  s.actionItems = 0;
  s.queue = [];
  s.bac = Math.min(s.bac, 20);
  s.stomach = 0;
  s.caffeine = Math.min(s.caffeine, 60);
  s.crash = 0;
  g.writeSlotFor('auto');
  showBurnout(g, fx.pick(DEATH_LINES), lost);
}

/**
 * The burnout screen, after the penalty (already paid and saved): clock back
 * in, load something better, or leave for the title. Coming back from the
 * load menu shows the same screen again; the penalty is not taken twice.
 */
function showBurnout(g: Game, line: string, lost: number): void {
  g.screen = 'dead';
  const spec = burnoutMenu();
  const act = {
    ...NO_ACTIONS,
    clockin: () => {
      g.rootT = 0;
      g.loadWorld(true);
      resume(g);
    },
    load: () => showLoadMenu(g, () => showBurnout(g, line, lost)),
    title: () => showTitle(g),
  };
  const p = document.createElement('p');
  p.className = 'title-blurb';
  p.textContent = line;
  setOverlay(g, `<div class="title-logo small dead">BURNOUT</div>${p.outerHTML}
    <p class="title-blurb">You lost ₡${lost} of Rep to the wellbeing webinar, and Management noticed. Your queue was reassigned.</p>`,
  fromSpec(spec, act), undefined, { menu: true, escape: escapeOf(spec, act) });
}

/** Ironman: one burnout and the career is over. */
function showCareerOver(g: Game): void {
  const s = g.save;
  deleteSlot('auto');
  setOverlay(g, `<div class="title-logo small dead">CAREER OVER</div>
    <p class="title-blurb">${fx.pick(DEATH_LINES)}</p>
    <p class="title-blurb">Ironman. ${s.name}, ${g.title}, level ${s.level}, burned out on ${g.floorName()} in week ${s.week}.
    Resolved ${s.stats.resolvedField} in person, ${s.stats.resolvedPeace} with words, ${s.stats.resolvedDesk} at a desk.
    ${s.stats.bosses} major incidents. The building does not remember you. The mökki does.</p>`, [
    ['New career', () => showChargen(g)],
  ]);
}

export function showEnding(g: Game, e: Ending): void {
  g.screen = 'ending';
  g.input.releaseLock();
  const s = g.save;
  s.won = true;
  g.achieve('ending');
  g.writeSlotFor('auto');
  sfx.levelUp();
  const st = s.stats;
  setOverlay(g, `<div class="title-logo small">${e.title}</div>
    <p class="title-blurb">${e.text}</p>
    <p class="title-blurb">${s.name}, ${g.title}, level ${s.level}. Field resolutions ${st.resolvedField} · Talked down ${st.resolvedPeace} · Desk fixes ${st.resolvedDesk} · SLA breaches ${st.breaches} · Drinks ${st.drinks} · Cans ${st.cans} · Blackouts ${st.blackouts} · Burnouts ${st.burnouts} · Elites ${st.elites} · Fish ${st.fish}</p>
    <p class="title-blurb">Achievements: ${s.achievements.length}. ...Three weeks later, the goats' Wi-Fi goes down. Workgrumble calls. They are offering overtime.</p>`, [
    ['Accept the overtime (keep playing)', () => g.goToMokki()],
    ['Retire (title screen)', () => showTitle(g)],
  ]);
}

export function showFired(g: Game): void {
  g.screen = 'ending';
  g.input.releaseLock();
  deleteSlot('auto');
  deleteSlot('quick');
  sfx.error();
  setOverlay(g, `<div class="title-logo small dead">P45</div>
    <p class="title-blurb">A trainee with three warnings and nowhere lower to go. Security walks you out holding a cardboard box with a stapler in it.</p>
    <p class="title-blurb">Your career is over. The mökki was always rented anyway.</p>`, [
    ['New career', () => showChargen(g)],
  ]);
}

export function transitionTo(g: Game, label: string, big: string, line: string, then: () => void): void {
  g.screen = 'transition';
  g.input.releaseLock();
  g.os.hide();
  sfx.ding();
  setOverlay(g, `<div class="lift"><div class="lift-num">${big}</div>
    <div class="lift-name">${label}</div>
    <p class="title-blurb">${line}</p></div>`, [['Continue', then]]);
}
