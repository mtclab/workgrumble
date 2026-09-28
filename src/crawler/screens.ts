import { sfx } from './audio';
import { showCharGen } from './chargen';
import { DEATH_LINES } from './content/lines';
import type { Game } from './game';
import { fx } from './rng';
import { type Ending, WORKPLACES } from './rpg';
import { clearAllSlots, deleteSlot, listSlots, SLOT_LABEL, type SlotId, timeAgo } from './saves';
import { adjustStanding } from './state';

/** The full-screen overlays: title, load menu, pause, burnout, endings, lifts. */

type Button = [string, () => void];

export function setOverlay(g: Game, html: string, buttons: Button[], extra?: HTMLElement): void {
  g.overlay.innerHTML = html;
  if (extra !== undefined) g.overlay.append(extra);
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
  g.overlay.append(row);
  g.overlay.style.display = 'flex';
}

export function hideOverlay(g: Game): void {
  g.overlay.style.display = 'none';
  g.overlay.replaceChildren();
}

const CONTROLS = `<div class="title-controls">
  <span><b>WASD</b> move</span><span><b>Mouse</b> look</span><span><b>LMB</b> tool (hold: heavy)</span><span><b>RMB</b> block (tap: shove)</span>
  <span><b>E</b> use / talk</span><span><b>F</b> cast rune</span><span><b>X</b> next rune</span><span><b>G</b> domain ability</span>
  <span><b>C</b> sneak</span><span><b>T</b> rest</span><span><b>Q</b> quick supplies</span><span><b>V</b> 1st/3rd person</span>
  <span><b>Shift</b> sprint</span><span><b>1-9</b> tools</span><span><b>Tab</b> backpack</span><span><b>J</b> journal · <b>M</b> map</span>
  <span><b>F5</b> quicksave</span><span><b>F9</b> quickload</span><span><b>Esc</b> pause</span><span></span>
</div>`;

export function showTitle(g: Game): void {
  g.screen = 'title';
  g.input.releaseLock();
  const buttons: Button[] = [];
  if (g.hasSave()) buttons.push([`Continue: ${g.save.name}, ${g.title} (${g.floorName()})`, () => startPlay(g)]);
  if (listSlots().length > 0) buttons.push(['Load game', () => showLoadMenu(g, () => showTitle(g))]);
  buttons.push(['New career', () => showChargen(g)]);
  setOverlay(g, `
    <div class="title-logo">WORKGRUMBLE</div>
    <div class="title-sub">H E L L D E S K</div>
    <p class="title-blurb">An IT career role-playing game. Start as an IT Trainee, climb twelve rungs to Senior Architect - or don't.
    Resolve the users, survive the managers and the consultants, keep the office ladies sweet, walk the tightropes of Friday drinks and
    energy cans, uncover Project Phoenix, and spend every weekend building up the mökki and learning the old sauna magic.</p>
    ${CONTROLS}`, buttons);
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
  setOverlay(g, '<div class="title-logo small">LOAD</div>', [['Back', back]], list);
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
    list.append(b);
  }
  setOverlay(g, '<div class="title-logo small">SAVE</div>', [['Back', () => showPause(g)]], list);
}

export function showChargen(g: Game): void {
  g.screen = 'chargen';
  hideOverlay(g);
  showCharGen(g.mount, (setup) => g.beginCareer(setup), () => showTitle(g));
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
  const buttons: Button[] = [['Resume', () => resume(g)]];
  if (!s.ironman) {
    buttons.push(['Save game', () => showSaveMenu(g)]);
    buttons.push(['Load game', () => showLoadMenu(g, () => showPause(g))]);
  }
  buttons.push(['Backpack & Career', () => g.openOs('pack')]);
  buttons.push(['Settings', () => g.openOs('pack', 'settings')]);
  buttons.push(['Title screen', () => { g.autosave(); showTitle(g); }]);
  setOverlay(g, `<div class="title-logo small">PAUSED</div>
    <p class="title-blurb">Taking a "comfort break". The SLA clocks are paused. Probably.${s.ironman ? ' <b>IRONMAN</b>: the building saves for you.' : ''}</p>
    ${CONTROLS}`, buttons);
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
  s.caffeine = Math.min(s.caffeine, 60);
  s.crash = 0;
  g.writeSlotFor('auto');
  setOverlay(g, `<div class="title-logo small dead">BURNOUT</div><p class="title-blurb">${fx.pick(DEATH_LINES)}</p>
    <p class="title-blurb">You lost ₡${lost} of Rep to the wellbeing webinar, and Management noticed. Your queue was reassigned.</p>`, [
    ['Clock back in (restart the floor)', () => {
      g.rootT = 0;
      g.loadWorld(true);
      resume(g);
    }],
  ]);
}

/** Ironman: one burnout and the career is over. */
function showCareerOver(g: Game): void {
  const s = g.save;
  clearAllSlots();
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
