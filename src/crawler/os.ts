import { CAFFEINE_EFFECTS, caffeineBand } from './caffeine';
import { TICKETS } from './content/tickets';
import {
  AMMO,
  CONSUMABLES,
  GEAR,
  type ItemDef,
  WEAPONS,
} from './items';
import { affixText, baseOf, type GearInstance, RARITY_INFO, sellValue, slotOf, uniqueSpecial } from './loot';
import { spellById } from './magic';
import { TREE_PERKS } from './perks';
import { currentObjective, EVIDENCE, MAIN, QUEST_ITEMS, questById } from './quests';
import {
  ARCH_INFO,
  ATTRIBUTE_INFO,
  ATTRIBUTES,
  attributeMultiplier,
  bandFor,
  BAND_EFFECTS,
  difficultyFor,
  DOMAIN_INFO,
  FACTION_INFO,
  FACTIONS,
  promille,
  promotionNeeds,
  RUNG_COUNT,
  salaryFor,
  SKILL_INFO,
  SKILL_UPS_PER_LEVEL,
  SKILLS,
  skillThreshold,
  standingLabel,
  TRACK_INFO,
  WORKPLACES,
} from './rpg';
import { fx } from './rng';
import type { Settings } from './settings';
import {
  ACTION_ITEM_KG,
  canTakePerk,
  type Derived,
  EMPTY_KG,
  perk,
  type QueuedTicket,
  type Quest,
  type SaveState,
  skill,
  skillSum,
} from './state';
import { ACHIEVEMENTS } from './upgrades';

/**
 * WorkgrumbleOS, as found on every desk in the building. The office sim's
 * whole game was this desktop; down here it is where you close tickets,
 * pick up work, requisition gear, manage your character and keep your
 * journal. Your backpack (Tab) opens the same windows, minus the work.
 */

export type Slot = 'weapon' | 'head' | 'body' | 'feet' | 'trinket';

export interface OsHost {
  readonly save: SaveState;
  readonly settings: Settings;
  readonly title: string;
  derived(): Derived;
  floorName(): string;
  buy(id: string): string | null;
  sell(uid: string): string | null;
  price(base: number): number;
  equipGear(uid: string): void;
  unequip(slot: Exclude<Slot, 'weapon'>): void;
  use(id: string): void;
  takePerk(id: string): void;
  resolve(q: QueuedTicket, label: string): { ok: boolean; message: string };
  fixOptions(q: QueuedTicket): string[];
  fixHint(q: QueuedTicket): string | null;
  garble(label: string): string;
  pullTickets(): number;
  newQuest(): Quest | null;
  claimQuest(q: Quest): void;
  slackOff(): string;
  canSlack(): boolean;
  hasTerminal(): boolean;
  close(): void;
  restart(): void;
  applySettings(): void;
  click(): void;
  error(): void;
  coin(): void;
}

export type AppId = 'tickets' | 'mail' | 'kb' | 'store' | 'inventory' | 'character' | 'hr' | 'journal' | 'achievements' | 'slack' | 'settings' | 'help';

interface Win {
  readonly app: AppId;
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  x: number;
  y: number;
}

type Child = Node | string | null | undefined | false;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') node.addEventListener(k.replace(/^on/, ''), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

const APPS: readonly { id: AppId; label: string; icon: string; desk: boolean; pack: boolean }[] = [
  { id: 'tickets', label: 'Tickets', icon: '🎫', desk: true, pack: false },
  { id: 'mail', label: 'Mail (Tasks)', icon: '✉️', desk: true, pack: false },
  { id: 'kb', label: 'KB Wiki', icon: '📘', desk: true, pack: false },
  { id: 'store', label: 'Internal IT', icon: '🛒', desk: true, pack: false },
  { id: 'inventory', label: 'Inventory', icon: '🎒', desk: true, pack: true },
  { id: 'character', label: 'Character', icon: '🧑‍💻', desk: true, pack: true },
  { id: 'journal', label: 'Journal', icon: '📓', desk: true, pack: true },
  { id: 'hr', label: 'HR Portal', icon: '🗂️', desk: true, pack: true },
  { id: 'achievements', label: 'Achievements', icon: '🏆', desk: true, pack: true },
  { id: 'slack', label: 'cat_pictures.url', icon: '🐱', desk: true, pack: false },
  { id: 'settings', label: 'Control Panel', icon: '⚙️', desk: true, pack: true },
  { id: 'help', label: 'Help', icon: '❓', desk: true, pack: true },
];

const floorLabel = (f: number): string => (f === 0 ? 'B1' : String(f));

export class Os {
  private readonly root: HTMLElement;
  private readonly desktop: HTMLElement;
  private readonly icons: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly status: HTMLElement;
  private wins: Win[] = [];
  private z = 10;
  private selectedTicket = 0;
  private kbFilter = '';
  private storeTab: 'weapons' | 'gear' | 'supplies' | 'ammo' | 'sell' = 'weapons';
  private feedback = '';
  mode: 'desk' | 'itdesk' | 'pack' | null = null;

  constructor(parent: HTMLElement, private readonly host: OsHost) {
    this.root = el('div', { class: 'os', 'data-testid': 'os' });
    this.desktop = el('div', { class: 'os-desktop' });
    this.clock = el('span', { class: 'os-clock' });
    this.status = el('span', { class: 'os-status' });
    this.icons = el('div', { class: 'os-icons' });
    this.desktop.append(this.icons);
    const taskbar = el('div', { class: 'os-taskbar' },
      el('button', { class: 'os-start', onclick: () => this.host.close() }, '⏻ Log off'),
      this.status,
      this.clock,
    );
    this.root.append(this.desktop, taskbar);
    this.root.style.display = 'none';
    parent.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (this.mode === null) return;
      const t = e.target;
      if (t instanceof HTMLInputElement && e.code !== 'Escape') return;
      if (e.code === 'Escape' || (this.mode === 'pack' && (e.code === 'Tab' || e.code === 'KeyI'))) {
        e.preventDefault();
        this.host.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.mode !== null;
  }

  open(mode: 'desk' | 'itdesk' | 'pack', first?: AppId): void {
    this.mode = mode;
    this.root.style.display = 'flex';
    this.root.classList.toggle('os-pack', mode !== 'desk');
    for (const w of this.wins) w.el.remove();
    this.wins = [];
    this.feedback = '';
    this.icons.replaceChildren();
    for (const app of APPS) {
      if (mode === 'desk' ? !app.desk : !app.pack) continue;
      this.icons.append(el('button', { class: 'os-icon', onclick: () => this.openApp(app.id) },
        el('span', { class: 'os-icon-glyph' }, app.icon), el('span', { class: 'os-icon-label' }, app.label)));
    }
    if (first !== undefined) this.openApp(first);
    else if (mode === 'desk') {
      this.openApp('tickets');
      if (this.host.save.quests.some((q) => q.done)) this.openApp('mail');
    } else if (mode === 'itdesk') {
      this.openApp('store');
    } else {
      this.openApp('inventory');
    }
    this.refresh();
  }

  hide(): void {
    this.mode = null;
    this.root.style.display = 'none';
  }

  private openApp(app: AppId): void {
    this.host.click();
    const existing = this.wins.find((w) => w.app === app);
    if (existing !== undefined) {
      existing.el.style.zIndex = String(++this.z);
      this.render(existing);
      return;
    }
    const title = el('div', { class: 'os-title' });
    const label = APPS.find((a) => a.id === app);
    const heading = this.mode === 'itdesk' && app === 'store'
      ? '🛒 Internal IT Service Desk - "Morag will see you now"'
      : `${label?.icon ?? ''} ${label?.label ?? app}`;
    const body = el('div', { class: 'os-body' });
    const win: Win = { app, el: el('div', { class: 'os-window' }), body, x: 0, y: 0 };
    title.append(el('span', {}, heading), el('button', { class: 'os-x', onclick: () => this.closeWin(win) }, '✕'));
    win.el.append(title, body);
    const n = this.wins.length;
    const maxX = Math.max(0, window.innerWidth - Math.min(860, window.innerWidth - 20) - 10);
    win.x = Math.min(this.mode === 'desk' ? 140 + n * 36 : 120 + n * 36, maxX);
    win.y = Math.min(20 + n * 30, Math.max(0, window.innerHeight - 200));
    win.el.style.left = `${win.x}px`;
    win.el.style.top = `${win.y}px`;
    win.el.style.zIndex = String(++this.z);
    win.el.addEventListener('mousedown', () => {
      win.el.style.zIndex = String(++this.z);
    });
    title.addEventListener('mousedown', (e) => {
      const sx = e.clientX - win.x;
      const sy = e.clientY - win.y;
      const move = (m: MouseEvent): void => {
        // Keep the title bar on screen so a window can never be lost.
        win.x = Math.max(-200, Math.min(window.innerWidth - 120, m.clientX - sx));
        win.y = Math.max(0, Math.min(window.innerHeight - 60, m.clientY - sy));
        win.el.style.left = `${win.x}px`;
        win.el.style.top = `${win.y}px`;
      };
      const up = (): void => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    this.desktop.append(win.el);
    this.wins.push(win);
    this.render(win);
  }

  private closeWin(win: Win): void {
    win.el.remove();
    this.wins = this.wins.filter((w) => w !== win);
    if (this.wins.length === 0 && this.mode !== 'desk') this.host.close();
  }

  refresh(): void {
    const s = this.host.save;
    const d = this.host.derived();
    this.clock.textContent = `${this.host.floorName()}`;
    this.status.textContent = `Rep ₡${s.rep}  |  Sanity ${Math.round(s.sanity)}/${d.maxSanity}  |  Queue ${s.queue.length}  |  ${d.weight}/${d.carry} kg${d.overEncumbered ? ' OVER-ENCUMBERED' : ''}`;
    for (const w of this.wins) this.render(w);
  }

  private render(w: Win): void {
    const scroll = w.body.scrollTop;
    w.body.replaceChildren();
    switch (w.app) {
      case 'tickets': this.renderTickets(w.body); break;
      case 'mail': this.renderMail(w.body); break;
      case 'kb': this.renderKb(w.body); break;
      case 'store': this.renderStore(w.body); break;
      case 'inventory': this.renderInventory(w.body); break;
      case 'character': this.renderCharacter(w.body); break;
      case 'hr': this.renderHr(w.body); break;
      case 'journal': this.renderJournal(w.body); break;
      case 'achievements': this.renderAchievements(w.body); break;
      case 'slack': this.renderSlack(w.body); break;
      case 'settings': this.renderSettings(w.body); break;
      case 'help': this.renderHelp(w.body); break;
    }
    w.body.scrollTop = scroll;
  }

  private say(msg: string): void {
    this.feedback = msg;
    this.refresh();
  }

  // ---- Tickets ----

  private renderTickets(body: HTMLElement): void {
    const s = this.host.save;
    const d = this.host.derived();
    const list = el('div', { class: 'os-list' });
    if (s.queue.length === 0) {
      list.append(el('p', { class: 'os-dim' }, s.location === 'mokki' ? 'It is the weekend. There is no queue. Log off.' : 'Queue empty. Nobody has thrown a ticket at you... yet.'));
    }
    s.queue.forEach((q, i) => {
      const t = TICKETS[q.t];
      if (t === undefined) return;
      const urgent = q.sla < 30;
      list.append(el('button', {
        class: `os-row${i === this.selectedTicket ? ' is-selected' : ''}${urgent ? ' is-alarm' : ''}`,
        onclick: () => {
          this.selectedTicket = i;
          this.feedback = '';
          this.refresh();
        },
      },
      el('span', { class: 'os-row-main' }, `${q.gold ? '⭐ ' : ''}${t.title}`),
      el('span', { class: 'os-row-meta' }, `${q.from} · SLA ${Math.max(0, Math.ceil(q.sla))}s`)));
    });
    const pull = el('button', {
      class: 'os-btn',
      ...(s.location === 'mokki' ? { disabled: 'true' } : {}),
      onclick: () => {
        const n = this.host.pullTickets();
        this.say(n > 0 ? `Picked up ${n} ticket(s) from the unassigned pile. Close them for Rep.` : 'Your queue is full. Close something first.');
      },
    }, '⤓ Pick up new tickets from the backlog');
    const left = el('div', { class: 'os-col-left' }, list, pull);

    const q = s.queue[this.selectedTicket] ?? s.queue[0];
    const right = el('div', { class: 'os-col-right' });
    if (q !== undefined) {
      const t = TICKETS[q.t];
      if (t !== undefined) {
        const pr = (n: number): string => ['P4', 'P3', 'P2', 'P1'][Math.max(0, Math.min(3, n))] ?? 'P3';
        right.append(
          el('h3', {}, t.title),
          el('p', { class: 'os-meta' }, `From ${t.reporter}${t.reporterTitle !== '' ? `, ${t.reporterTitle}` : ''} · Claimed ${pr(t.claimed)} · Actually ${pr(t.urgency)}${q.gold ? ' · GOLD SLA' : ''}`),
          el('p', { class: 'os-ticket-body' }, t.body),
        );
        if (d.duck) right.append(el('p', { class: 'os-note' }, `🦆 You explain it to the duck. The duck suggests: ${t.cause}`));
        // Build the options first: the hunch is decided when they are.
        const options = this.host.fixOptions(q);
        const hint = this.host.fixHint(q);
        if (s.bac >= 42) right.append(el('p', { class: 'os-note' }, 'The words on the screen are swimming a bit.'));
        right.append(el('p', { class: 'os-dim' }, 'Apply a fix:'));
        for (const label of options) {
          right.append(el('button', {
            class: `os-btn os-fix${label === hint ? ' os-hint' : ''}`,
            onclick: () => {
              const res = this.host.resolve(q, label);
              if (res.ok) this.selectedTicket = 0;
              this.say(res.message);
            },
          }, `${label === hint ? '💡' : '▶'} ${this.host.garble(label)}`));
        }
        if (hint !== null) right.append(el('p', { class: 'os-meta' }, `💡 Your Troubleshooting (${skill(s, 'troubleshooting')}) has a hunch.`));
        if (t.kb !== null) {
          right.append(el('button', {
            class: 'os-link',
            onclick: () => {
              this.kbFilter = t.kb?.title ?? '';
              this.openApp('kb');
            },
          }, `📘 KB: ${t.kb.title}`));
        }
      }
    } else {
      right.append(el('p', { class: 'os-dim' }, 'Select a ticket. Tickets arrive when users throw them at you (literally), or pick some up from the backlog.'));
    }
    if (this.feedback !== '') right.append(el('p', { class: 'os-feedback' }, this.feedback));
    body.append(el('div', { class: 'os-split' }, left, right));
  }

  // ---- Mail / tasks ----

  private renderMail(body: HTMLElement): void {
    const s = this.host.save;
    body.append(el('p', { class: 'os-dim' }, 'Your inbox. Tasks from around the building: finish them for Rep and Management standing. (Story and side quests live in the Journal.)'));
    for (const q of s.quests) {
      const row = el('div', { class: `os-mail${q.done ? ' is-done' : ''}` },
        el('div', { class: 'os-mail-head' }, el('b', {}, q.title), el('span', {}, ` - from ${q.from}`)),
        el('p', {}, q.body),
        el('p', { class: 'os-meta' }, `Progress: ${Math.min(q.progress, q.goal)}/${q.goal} · Reward ₡${q.reward}`),
      );
      if (q.done && q.kind !== 'boss') {
        row.append(el('button', { class: 'os-btn', onclick: () => { this.host.claimQuest(q); this.say(`Claimed ₡${q.reward}.`); } }, '✔ Mark complete & claim'));
      }
      body.append(row);
    }
    const active = s.quests.filter((q) => q.kind !== 'boss').length;
    body.append(el('button', {
      class: 'os-btn',
      ...(s.location === 'mokki' ? { disabled: 'true' } : {}),
      onclick: () => {
        const q = this.host.newQuest();
        this.say(q === null ? 'You already have three tasks on. Even you have limits.' : `New task: ${q.title}`);
      },
    }, s.location === 'mokki' ? 'No tasks at weekends. Probably.' : active >= 3 ? 'Inbox full (3 tasks max)' : '📨 Check for new tasks'));
    if (this.feedback !== '') body.append(el('p', { class: 'os-feedback' }, this.feedback));
  }

  // ---- KB ----

  private renderKb(body: HTMLElement): void {
    const s = this.host.save;
    const input = el('input', { class: 'os-input', placeholder: 'Search the knowledge base...', value: this.kbFilter });
    input.addEventListener('input', () => {
      this.kbFilter = input.value;
      const pos = input.selectionStart;
      this.refresh();
      const again = body.querySelector('input');
      if (again !== null) {
        again.focus();
        again.setSelectionRange(pos, pos);
      }
    });
    body.append(input);
    const queued = new Set(s.queue.map((q) => q.t));
    const needle = this.kbFilter.toLowerCase();
    const seen = new Set<string>();
    const results = TICKETS
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.kb !== null)
      .filter(({ t }) => needle === '' || t.title.toLowerCase().includes(needle) || (t.kb?.title.toLowerCase().includes(needle) ?? false))
      .sort((a, b) => Number(queued.has(b.i)) - Number(queued.has(a.i)))
      .filter(({ t }) => {
        const k = t.kb?.title ?? '';
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 12);
    for (const { t, i } of results) {
      if (t.kb === null) continue;
      body.append(el('div', { class: 'os-kb' },
        el('b', {}, `${queued.has(i) ? '📌 ' : ''}${t.kb.title}`),
        el('ol', {}, ...t.kb.resolution.map((line) => el('li', {}, line)))));
    }
    if (results.length === 0) body.append(el('p', { class: 'os-dim' }, 'No articles. Somebody should write one. It will not be you.'));
  }

  // ---- Store ----

  private renderStore(body: HTMLElement): void {
    const s = this.host.save;
    const tabs = el('div', { class: 'os-tabs' });
    for (const t of ['weapons', 'gear', 'supplies', 'ammo', 'sell'] as const) {
      tabs.append(el('button', { class: `os-tab${this.storeTab === t ? ' is-selected' : ''}`, onclick: () => { this.storeTab = t; this.feedback = ''; this.refresh(); } }, t === 'sell' ? 'Sell (e-waste)' : `${t[0]?.toUpperCase() ?? ''}${t.slice(1)}`));
    }
    body.append(el('p', { class: 'os-dim' }, this.mode === 'itdesk'
      ? '"Budget code? Right. Sign here, here and here. No, you cannot have admin rights." - Morag, Internal IT'
      : 'Internal IT Requisition Portal v3.1 - approvals are instant if you have the Rep. Prices follow your IT Crowd standing and Charm.'), tabs);
    const grid = el('div', { class: 'os-store' });
    if (this.storeTab === 'sell') {
      const equipped = new Set(Object.values(s.equipped));
      const spare = s.gear.filter((g) => !equipped.has(g.uid));
      if (spare.length === 0) grid.append(el('p', { class: 'os-dim' }, 'Nothing to sell. Everything you own, you are wearing or holding.'));
      for (const g of spare) {
        grid.append(this.gearCard(g, false, el('button', {
          class: 'os-btn',
          onclick: () => {
            const err = this.host.sell(g.uid);
            if (err !== null) this.host.error();
            else this.host.coin();
            this.say(err ?? `${g.name}: sold for e-waste.`);
          },
        }, `Sell for ₡${sellValue(g)}`)));
      }
    } else {
      const items: readonly ItemDef[] = this.storeTab === 'weapons' ? WEAPONS.filter((w) => w.price > 0)
        : this.storeTab === 'gear' ? GEAR : this.storeTab === 'supplies' ? CONSUMABLES.filter((c) => c.unsold !== true) : AMMO;
      for (const item of items) {
        const locked = item.minFloor > s.floor;
        const owned = (item.slot === 'weapon' || item.slot === 'head' || item.slot === 'body' || item.slot === 'feet' || item.slot === 'trinket') && s.gear.some((g) => g.base === item.id);
        const count = item.slot === 'consumable' ? s.consumables[item.id] ?? 0 : null;
        grid.append(el('div', { class: `os-item${locked ? ' is-locked' : ''}` },
          el('b', {}, item.name),
          el('p', {}, locked ? `Clearance required: Floor ${floorLabel(item.minFloor)}.` : item.desc),
          el('p', { class: 'os-meta' }, `₡${this.host.price(item.price)} · ${item.weight} kg${count !== null ? ` · have ${count}` : ''}${owned ? ' · you have one' : ''}`),
          el('button', {
            class: 'os-btn',
            ...(locked ? { disabled: 'true' } : {}),
            onclick: () => {
              const err = this.host.buy(item.id);
              if (err !== null) this.host.error();
              else this.host.coin();
              this.say(err ?? `${item.name}: requisition approved.`);
            },
          }, locked ? 'Locked' : 'Requisition')));
      }
    }
    body.append(grid);
    if (this.feedback !== '') body.append(el('p', { class: 'os-feedback' }, this.feedback));
  }

  private gearCard(g: GearInstance, equipped: boolean, button: HTMLElement | null): HTMLElement {
    const base = baseOf(g);
    const special = uniqueSpecial(g.unique);
    const card = el('div', { class: `os-item${equipped ? ' is-equipped' : ''}` },
      el('b', { class: `rarity-${g.rarity}` }, g.name),
      el('p', { class: 'os-meta' }, `${RARITY_INFO[g.rarity].name} ${slotOf(g) ?? ''} · ${base?.weight ?? 0} kg${equipped ? ' · EQUIPPED' : ''}`),
      el('p', {}, base?.desc ?? ''),
      ...g.affixes.map((a) => el('p', { class: 'os-affix' }, affixText(a))),
      special !== '' ? el('p', { class: 'os-special' }, special) : null,
    );
    if (button !== null) card.append(button);
    return card;
  }

  // ---- Inventory ----

  private renderInventory(body: HTMLElement): void {
    const s = this.host.save;
    const d = this.host.derived();
    body.append(el('p', { class: `os-meta${d.overEncumbered ? ' is-alarm' : ''}` },
      `Carrying ${d.weight}/${d.carry} kg${s.actionItems > 0 ? ` (incl. ${s.actionItems} action item${s.actionItems > 1 ? 's' : ''} at ${ACTION_ITEM_KG} kg)` : ''}${s.empties > 0 ? ` (and ${s.empties} empties at ${EMPTY_KG} kg)` : ''}${d.overEncumbered ? ' - OVER-ENCUMBERED: slow, no sprinting' : ''} · Rep ₡${s.rep}`));
    const equipped = new Set(Object.values(s.equipped));
    for (const slot of ['weapon', 'head', 'body', 'feet', 'trinket'] as const) {
      const items = s.gear.filter((g) => slotOf(g) === slot);
      if (items.length === 0) continue;
      body.append(el('h4', {}, slot === 'weapon' ? 'Tools (1-9 to switch)' : slot[0]?.toUpperCase() + slot.slice(1)));
      const grid = el('div', { class: 'os-store' });
      for (const g of items) {
        const on = equipped.has(g.uid);
        const btn = on
          ? (slot === 'weapon' ? null : el('button', { class: 'os-btn', onclick: () => { this.host.unequip(slot); this.refresh(); } }, 'Take off'))
          : el('button', { class: 'os-btn', onclick: () => { this.host.equipGear(g.uid); this.refresh(); } }, 'Equip');
        grid.append(this.gearCard(g, on, btn));
      }
      body.append(grid);
    }
    body.append(el('p', { class: 'os-meta' }, `Ammo: labels ${s.ammo.labels} · air ${s.ammo.air} · ducks ${s.ammo.ducks} · toner ${s.ammo.toner}`));
    const packs = el('div', { class: 'os-store' });
    for (const c of CONSUMABLES) {
      const n = s.consumables[c.id] ?? 0;
      if (n <= 0) continue;
      const label = c.book !== undefined ? 'Read' : c.bac !== undefined ? 'Drink' : c.rune !== undefined ? 'Study' : c.id === 'paperclip' ? null : 'Use';
      packs.append(el('div', { class: 'os-item' }, el('b', {}, `${c.name} ×${n}`), el('p', {}, c.desc),
        label === null ? null : el('button', { class: 'os-btn', onclick: () => { this.host.use(c.id); this.refresh(); } }, label)));
    }
    const laptop = s.consumables.laptop ?? 0;
    if (laptop > 0) packs.append(el('div', { class: 'os-item' }, el('b', {}, `Replacement laptop ×${laptop}`), el('p', {}, 'For a delivery task. Walk up to the recipient and press E.')));
    body.append(el('h4', {}, 'Supplies (Q quick-uses food and coffee; drinks are never quick-used)'), packs);
    if (s.questItems.length > 0) {
      body.append(el('h4', {}, 'Quest items'));
      for (const id of s.questItems) {
        const q = QUEST_ITEMS[id];
        body.append(el('div', { class: 'os-mail' }, el('b', {}, q?.name ?? id), el('p', {}, q?.desc ?? '')));
      }
    }
  }

  // ---- Character ----

  private renderCharacter(body: HTMLElement): void {
    const s = this.host.save;
    const d = this.host.derived();
    body.append(
      el('h3', {}, `${s.name} - ${this.host.title} (Level ${s.level})`),
      el('div', { class: 'os-bar' }, el('div', { class: 'os-bar-fill', style: `width:${Math.min(100, Math.round((s.skillUps / SKILL_UPS_PER_LEVEL) * 100))}%` })),
      el('p', { class: 'os-meta' }, `Skill increases toward next level: ${s.skillUps}/${SKILL_UPS_PER_LEVEL}${s.skillUps >= SKILL_UPS_PER_LEVEL ? ' - REST (T) TO LEVEL UP' : ''} · Max sanity ${d.maxSanity} · Max Löyly ${d.maxLoyly} · Armour ${Math.round(d.armor * 100)}% · Speed ×${d.speedMult.toFixed(2)} · Dodge ${Math.round(d.dodge * 100)}% · Melee ×${d.meleeMult.toFixed(2)} · Ranged ×${d.rangedMult.toFixed(2)}`),
    );
    const attrs = el('div', { class: 'os-equip' });
    for (const a of ATTRIBUTES) {
      attrs.append(el('label', { title: ATTRIBUTE_INFO[a].desc }, el('span', {}, `${ATTRIBUTE_INFO[a].name} ${s.attrs[a]}`), el('span', { class: 'os-meta' }, `next level ×${attributeMultiplier(s.attrUps[a])} · ${ATTRIBUTE_INFO[a].desc}`)));
    }
    body.append(el('h4', {}, 'Attributes'), attrs);
    const skills = el('div', {});
    for (const k of SKILLS) {
      const st = s.skills[k];
      const major = s.major.includes(k);
      skills.append(el('div', { class: 'os-skill', title: SKILL_INFO[k].desc },
        el('span', {}, `${major ? '★ ' : ''}${SKILL_INFO[k].name}`),
        el('b', {}, String(skill(s, k))),
        el('div', { class: 'os-bar' }, el('div', { class: 'os-bar-fill', style: `width:${Math.min(100, Math.round((st.progress / skillThreshold(st.value)) * 100))}%` }))));
    }
    body.append(el('h4', {}, 'Skills (★ major: learn 50% faster) - skills rise by use, or from books and trainers'), skills);

    body.append(el('h4', {}, `Perks - ${s.perkPoints} point${s.perkPoints === 1 ? '' : 's'} to spend (one per level)`));
    const trees: (keyof typeof SKILL_INFO | null)[] = [null, ...SKILLS];
    for (const tree of trees) {
      const perks = TREE_PERKS.filter((p) => p.tree === tree);
      if (perks.length === 0) continue;
      const level = tree === null ? null : s.skills[tree].value;
      body.append(el('p', { class: 'os-perk-tree' }, tree === null ? 'General' : `${SKILL_INFO[tree].name} (${level ?? 0})`));
      const grid = el('div', { class: 'os-store' });
      for (const p of perks) {
        const rank = perk(s, p.id);
        const next = p.ranks[rank];
        const can = canTakePerk(s, p.id);
        grid.append(el('div', { class: `os-item${rank > 0 ? ' is-equipped' : ''}` },
          el('b', {}, `${p.name} ${rank}/${p.ranks.length}`),
          ...p.ranks.map((r, i) => el('p', { class: i < rank ? 'os-affix' : 'os-meta' }, `${i < rank ? '✔' : '·'} ${tree === null ? '' : `[${r.skill}] `}${r.desc}`)),
          el('button', {
            class: 'os-btn',
            ...(can ? {} : { disabled: 'true' }),
            onclick: () => { this.host.takePerk(p.id); this.refresh(); },
          }, next === undefined ? 'Maxed' : can ? 'Learn' : tree !== null && (level ?? 0) < next.skill ? `Needs ${SKILL_INFO[tree].name} ${next.skill}` : 'No points')));
      }
      body.append(grid);
    }
    if (s.spells.length > 0) {
      body.append(el('h4', {}, 'Runes known (X to select, F to cast)'), el('p', { class: 'os-meta' }, s.spells.map((id) => { const sp = spellById(id); return sp === undefined ? id : `${sp.name} (${sp.english}, ${sp.cost})`; }).join(' · ')));
    }
    const caff = CAFFEINE_EFFECTS[caffeineBand(s.caffeine, s.caffeineTol)];
    body.append(el('h4', {}, 'Condition'),
      el('p', { class: 'os-meta' }, `Promille ${promille(s.bac)}‰ (${BAND_EFFECTS[bandFor(s.bac)].label}) · Dependency ${Math.round(s.dependency)}/100${s.dependency >= 50 ? ' (withdrawal when sober)' : ''}${s.hangover > 0 ? ' · hungover' : ''}`),
      el('p', { class: 'os-meta' }, `Caffeine ${Math.round(s.caffeine)} mg (${caff.label}) · tolerance ${Math.round(s.caffeineTol * 100)}%${s.crash > 0 ? ' · CRASHING' : ''}`),
      el('p', { class: 'os-meta' }, `Field resolutions ${s.stats.resolvedField} · Talked down ${s.stats.resolvedPeace} · Desk fixes ${s.stats.resolvedDesk} (${s.stats.wrongFixes} wrong) · SLA breaches ${s.stats.breaches} · Burnouts ${s.stats.burnouts} · Bosses ${s.stats.bosses} · Elites ${s.stats.elites} · Drinks ${s.stats.drinks} · Cans ${s.stats.cans} · Blackouts ${s.stats.blackouts} · Locks picked ${s.stats.locks} · Runes cast ${s.stats.spellsCast} · Fish ${s.stats.fish}`));
  }

  // ---- HR ----

  private renderHr(body: HTMLElement): void {
    const s = this.host.save;
    const next = s.rung + 1;
    const wp = WORKPLACES[s.workplace];
    body.append(
      el('h3', {}, `${s.name}: ${this.host.title}`),
      el('p', { class: 'os-meta' }, `Rung ${s.rung + 1} of ${RUNG_COUNT} · difficulty ×${difficultyFor(s.rung).toFixed(2)} × ${wp.name} ×${wp.enemy}${s.ironman ? ' · IRONMAN' : ''} · salary ₡${salaryFor(s.rung)} a week (paid at the mökki)`),
    );
    if (s.domain !== null && s.track !== null) {
      body.append(el('p', { class: 'os-note' }, `${s.domain} - ${DOMAIN_INFO[s.domain].desc} · ${TRACK_INFO[s.track].name}: ${TRACK_INFO[s.track].desc}`));
    }
    if (s.arch !== null) body.append(el('p', { class: 'os-note' }, `${ARCH_INFO[s.arch].name(s.domain ?? 'Systems')}: ${ARCH_INFO[s.arch].desc}`));
    if (next < RUNG_COUNT) {
      const n = promotionNeeds(next);
      const row = (label: string, have: number, need: number): HTMLElement =>
        el('p', { class: `os-meta${have >= need ? '' : ' is-alarm'}` }, `${have >= need ? '✔' : '✖'} ${label}: ${Math.round(have)} / ${need}`);
      body.append(el('h4', {}, 'Next performance review (Friday, at the mökki)'),
        row('Management standing', s.standing.management, n.management),
        row('Top-four skills', skillSum(s), n.skillSum),
        row('Level', s.level, n.level));
    }
    body.append(el('h4', {}, 'Standing'));
    for (const f of FACTIONS) {
      const v = s.standing[f];
      const bar = el('div', { class: 'os-standing-bar' });
      const fill = el('i', { class: v < 0 ? 'neg' : '' });
      fill.style.left = v < 0 ? `${50 + v / 2}%` : '50%';
      fill.style.width = `${Math.abs(v) / 2}%`;
      bar.append(fill);
      body.append(el('div', { class: 'os-standing', title: FACTION_INFO[f].desc }, el('span', {}, FACTION_INFO[f].name), bar, el('span', {}, `${Math.round(v)} ${standingLabel(v)}`)));
    }
    body.append(
      el('h4', {}, 'Conduct'),
      el('p', { class: s.warnings > 0 ? 'os-meta is-alarm' : 'os-meta' }, `Warnings on file: ${s.warnings}/3. Three means a disciplinary hearing.`),
      el('p', { class: 'os-meta' }, `Audit findings with your name near them: ${s.findings}.`),
      el('p', { class: 'os-dim' }, 'HR reminds all staff that the office fridge is not a communal resource.'),
    );
  }

  // ---- Journal ----

  private renderJournal(body: HTMLElement): void {
    const s = this.host.save;
    const has = (id: string): boolean => s.questItems.includes(id);
    body.append(el('h3', {}, 'Project Phoenix'));
    const ch = MAIN[Math.min(s.floor, MAIN.length - 1)];
    if (ch !== undefined && s.floor < MAIN.length) {
      body.append(el('p', {}, el('b', {}, `Chapter ${ch.floor + 1}: ${ch.title}. `), ch.text));
      if (ch.evidence !== undefined && !has(ch.evidence.item)) body.append(el('p', { class: 'os-note' }, `Evidence on this floor: ${QUEST_ITEMS[ch.evidence.item]?.name ?? ''}. ${ch.evidence.hint}`));
    } else {
      body.append(el('p', {}, 'The story of Project Phoenix is over. The overtime is not.'));
    }
    body.append(el('p', { class: 'os-meta' }, `Evidence: ${EVIDENCE.map((e) => `${has(e) ? '✔' : '✖'} ${QUEST_ITEMS[e]?.name ?? e}`).join(' · ')}`));
    const active = s.questLog.filter((q) => !q.done);
    const done = s.questLog.filter((q) => q.done);
    if (active.length > 0) {
      body.append(el('h4', {}, 'Active quests'));
      for (const q of active) {
        const def = questById(q.id);
        const obj = currentObjective(q);
        body.append(el('div', { class: 'os-mail' }, el('b', {}, def?.title ?? q.id), el('span', { class: 'os-meta' }, ` - ${def?.giver ?? ''}, Floor ${floorLabel(q.floor)}`),
          el('p', {}, `${obj?.text ?? ''}${obj?.count !== undefined ? ` (${q.progress}/${obj.count})` : ''}`)));
      }
    }
    if (done.length > 0) {
      body.append(el('h4', {}, 'Completed'), el('p', { class: 'os-meta' }, done.map((q) => questById(q.id)?.title ?? q.id).join(' · ')));
    }
    body.append(el('h4', {}, 'Entries'));
    if (s.journal.length === 0) body.append(el('p', { class: 'os-dim' }, 'Nothing written yet.'));
    for (const j of [...s.journal].reverse()) {
      body.append(el('div', { class: 'os-mail' }, el('p', { class: 'os-meta' }, `Floor ${floorLabel(j.floor)}`), el('p', {}, j.text)));
    }
  }

  private renderAchievements(body: HTMLElement): void {
    const s = this.host.save;
    body.append(el('p', { class: 'os-meta' }, `${s.achievements.length} of ${ACHIEVEMENTS.length} unlocked.`));
    for (const a of ACHIEVEMENTS) {
      const got = s.achievements.includes(a.id);
      body.append(el('div', { class: `ach${got ? '' : ' is-locked'}` }, el('span', {}, got ? '🏆' : '🔒'), el('div', {}, el('b', {}, a.name), el('span', { class: 'os-meta' }, a.desc))));
    }
  }

  // ---- Slack ----

  private renderSlack(body: HTMLElement): void {
    const cats = ['(=^･ω･^=)', '(^・ω・^ )', 'ฅ^•ﻌ•^ฅ', '(=｀ω´=)', '/ᐠ｡ꞈ｡ᐟ\\'];
    const terminal = this.host.hasTerminal();
    body.append(
      el('div', { class: 'os-cat' }, fx.pick(cats)),
      el('p', {}, 'Slacking restores sanity. It is genuinely optimal play. But if a manager walks past...'),
      el('button', {
        class: 'os-btn',
        ...(this.host.canSlack() ? {} : { disabled: 'true' }),
        onclick: () => this.say(this.host.slackOff()),
      }, !terminal ? 'The cat pictures need a computer. This is a service counter.' : this.host.canSlack() ? 'Look at cats for five minutes' : 'You have already slacked at this desk'),
    );
    if (this.feedback !== '') body.append(el('p', { class: 'os-feedback' }, this.feedback));
  }

  // ---- Settings ----

  private renderSettings(body: HTMLElement): void {
    const st = this.host.settings;
    const set = (): void => this.host.applySettings();
    const select = (label: string, value: string, options: [string, string][], onChange: (v: string) => void): HTMLElement => {
      const sel = el('select', { class: 'os-input' });
      for (const [v, t] of options) {
        const o = el('option', { value: v }, t);
        if (v === value) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => { onChange(sel.value); set(); });
      return el('label', {}, el('span', {}, label), sel);
    };
    const range = (label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void, fmt: (v: number) => string): HTMLElement => {
      const out = el('span', { class: 'os-meta' }, fmt(value));
      const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
      r.addEventListener('input', () => { onChange(Number(r.value)); out.textContent = fmt(Number(r.value)); set(); });
      return el('label', {}, el('span', {}, label), r, out);
    };
    const toggle = (label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement =>
      select(label, value ? 'on' : 'off', [['on', 'On'], ['off', 'Off']], (v) => onChange(v === 'on'));
    body.append(
      el('h4', {}, 'Camera and controls'),
      el('div', { class: 'os-equip' },
        select('Camera (V)', st.view, [['third', 'Third person'], ['first', 'First person']], (v) => { st.view = v === 'first' ? 'first' : 'third'; }),
        range('Field of view', st.fov, 55, 110, 1, (v) => { st.fov = v; }, (v) => `${v}°`),
        range('Mouse sensitivity', st.sensitivity, 0.2, 3, 0.1, (v) => { st.sensitivity = v; }, (v) => v.toFixed(1)),
        toggle('Invert mouse Y', st.invertY, (v) => { st.invertY = v; }),
        toggle('Camera shake', st.shake, (v) => { st.shake = v; })),
      el('h4', {}, 'Graphics'),
      el('div', { class: 'os-equip' },
        select('Quality', st.quality, [['low', 'Low (fast)'], ['medium', 'Medium'], ['high', 'High']], (v) => { st.quality = v === 'low' ? 'low' : v === 'medium' ? 'medium' : 'high'; }),
        range('Render scale', st.renderScale, 0.5, 1.5, 0.05, (v) => { st.renderScale = v; }, (v) => `${Math.round(v * 100)}%`),
        toggle('Bloom (glow)', st.bloom, (v) => { st.bloom = v; }),
        toggle('Damage numbers', st.damageNumbers, (v) => { st.damageNumbers = v; })),
      el('h4', {}, 'Sound'),
      el('div', { class: 'os-equip' },
        range('Music', st.music, 0, 1, 0.05, (v) => { st.music = v; }, (v) => `${Math.round(v * 100)}%`),
        range('Effects', st.sfx, 0, 1, 0.05, (v) => { st.sfx = v; }, (v) => `${Math.round(v * 100)}%`)),
      el('h4', {}, 'Interface'),
      el('div', { class: 'os-equip' },
        toggle('Tutorial tips', st.tips, (v) => { st.tips = v; }),
        toggle('Compass', st.compass, (v) => { st.compass = v; }),
        toggle('Autosave', st.autosave, (v) => { st.autosave = v; })),
      el('button', {
        class: 'os-btn os-danger',
        onclick: () => {
          if (confirm('Resign and start a new career? (Your saves stay in their slots.)')) this.host.restart();
        },
      }, 'Resign (new career)'),
    );
  }

  private renderHelp(body: HTMLElement): void {
    const sec = (title: string, lines: string[]): void => {
      body.append(el('h4', {}, title), el('ul', { class: 'os-help' }, ...lines.map((l) => el('li', {}, l))));
    };
    sec('Controls', [
      'WASD move · Shift sprint · Space jump · Mouse look · V first/third person',
      'LMB use tool (hold with a melee tool for a power attack) · RMB hold to block, tap to shove',
      'E interact / talk · Q quick-use food or coffee · 1-9 or wheel switch tools',
      'F cast rune · X next rune · G domain ability · C sneak · T rest (and level up)',
      'Tab backpack · M map · F5 quicksave · F9 quickload · Esc pause',
    ]);
    sec('The job', [
      'People throw real tickets at you. Solve them at any computer before the SLA runs out, or resolve the person in person.',
      'Most angry people can be talked down (E): every option shows its odds. Failure makes them angrier.',
      'Managers slow you, drag you into meetings and give you 6 kg action items. Accept their meeting to get rid of them.',
      'Every floor has a boss. Resolve them to unlock the lift. Every Friday you go to the mökki.',
    ]);
    sec('Growing', [
      'Skills rise by use. Eight skill increases and you can level up - by resting (T, or the mökki bed).',
      'Each level: raise two attributes (the more their skills rose, the bigger the raise) and take a perk.',
      'The career ladder is the difficulty: every promotion makes the building fight harder and pay better.',
    ]);
    sec('The tightropes', [
      'Alcohol: the Ballmer Peak (green on the meter) is a real bonus; past it you sway, managers smell it, and blackouts happen.',
      'Caffeine: alert and wired are fast; jittery and palpitations hurt; the higher you go the harder you crash.',
      'Both leave evidence and dependence. The sauna, the lake, water and sleep put you right.',
    ]);
    sec('Mökki magic', [
      'Löyly is your mana. Saunas refill it. The Saunatonttu teaches runes; rune stones hide in supply closets.',
      'Sauna then straight into the lake at the mökki: blessed for the whole next week.',
    ]);
  }
}
