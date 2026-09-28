import { TICKETS } from './content/tickets';
import {
  AMMO,
  CONSUMABLES,
  GEAR,
  type ItemDef,
  itemById,
  PERKS,
  WEAPONS,
} from './items';
import { spellById } from './magic';
import {
  ATTRIBUTE_INFO,
  ATTRIBUTES,
  attributeMultiplier,
  difficultyFor,
  DOMAIN_INFO,
  FACTION_INFO,
  FACTIONS,
  promotionNeeds,
  salaryFor,
  SKILL_INFO,
  SKILL_UPS_PER_LEVEL,
  SKILLS,
  skillThreshold,
  standingLabel,
  TRACK_INFO,
} from './rpg';
import { fx } from './rng';
import { ACTION_ITEM_KG, type Derived, EMPTY_KG, perk, type QueuedTicket, type Quest, type SaveState, skill, skillSum } from './state';

/**
 * WorkgrumbleOS, as found on every desk in the building. The office sim's
 * whole game was this desktop; down here it is where you go to close the
 * tickets people have thrown at you, pick up new work, and requisition gear.
 */

export interface OsHost {
  readonly save: SaveState;
  derived(): Derived;
  floorName(): string;
  buy(id: string): string | null;
  equip(slot: 'weapon' | 'head' | 'body' | 'feet' | 'trinket', id: string | null): void;
  use(id: string): void;
  resolve(q: QueuedTicket, label: string): { ok: boolean; message: string };
  fixOptions(q: QueuedTicket): string[];
  pullTickets(): number;
  newQuest(): Quest | null;
  claimQuest(q: Quest): void;
  spendPerk(id: string): void;
  slackOff(): string;
  canSlack(): boolean;
  close(): void;
  restart(): void;
  setView(v: 'first' | 'third'): void;
  setSens(v: number): void;
  setVolume(v: number): void;
  setBloom(on: boolean): void;
  price(base: number): number;
  garble(label: string): string;
  fixHint(q: QueuedTicket): string | null;
  readonly title: string;
  click(): void;
  error(): void;
  coin(): void;
}

type AppId = 'tickets' | 'mail' | 'kb' | 'store' | 'career' | 'hr' | 'journal' | 'slack' | 'settings';

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

const APPS: readonly { id: AppId; label: string; icon: string }[] = [
  { id: 'tickets', label: 'Tickets', icon: '🎫' },
  { id: 'mail', label: 'Mail (Tasks)', icon: '✉️' },
  { id: 'kb', label: 'KB Wiki', icon: '📘' },
  { id: 'store', label: 'Internal IT', icon: '🛒' },
  { id: 'career', label: 'Character & Kit', icon: '🧑‍💻' },
  { id: 'hr', label: 'HR Portal', icon: '🗂️' },
  { id: 'journal', label: 'Journal', icon: '📓' },
  { id: 'slack', label: 'cat_pictures.url', icon: '🐱' },
  { id: 'settings', label: 'Control Panel', icon: '⚙️' },
];

export class Os {
  private readonly root: HTMLElement;
  private readonly desktop: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly status: HTMLElement;
  private wins: Win[] = [];
  private z = 10;
  private selectedTicket = 0;
  private kbFilter = '';
  private storeTab: 'weapons' | 'gear' | 'supplies' | 'ammo' = 'weapons';
  private feedback = '';
  mode: 'desk' | 'itdesk' | 'pack' | null = null;

  constructor(parent: HTMLElement, private readonly host: OsHost) {
    this.root = el('div', { class: 'os', 'data-testid': 'os' });
    this.desktop = el('div', { class: 'os-desktop' });
    this.clock = el('span', { class: 'os-clock' });
    this.status = el('span', { class: 'os-status' });
    const icons = el('div', { class: 'os-icons' });
    for (const app of APPS) {
      icons.append(el('button', { class: 'os-icon', onclick: () => this.openApp(app.id) },
        el('span', { class: 'os-icon-glyph' }, app.icon), el('span', { class: 'os-icon-label' }, app.label)));
    }
    this.desktop.append(icons);
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
      if (e.code === 'Escape' || (this.mode === 'pack' && (e.code === 'Tab' || e.code === 'KeyI'))) {
        e.preventDefault();
        this.host.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.mode !== null;
  }

  open(mode: 'desk' | 'itdesk' | 'pack'): void {
    this.mode = mode;
    this.root.style.display = 'flex';
    this.root.classList.toggle('os-pack', mode === 'pack');
    for (const w of this.wins) w.el.remove();
    this.wins = [];
    this.feedback = '';
    if (mode === 'desk') {
      this.openApp('tickets');
      if (this.host.save.quests.some((q) => q.done)) this.openApp('mail');
    } else if (mode === 'itdesk') {
      this.openApp('store');
    } else {
      this.openApp('career');
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
      : this.mode === 'pack' && app === 'career' ? '🎒 Your Backpack & Career' : `${label?.icon ?? ''} ${label?.label ?? app}`;
    const body = el('div', { class: 'os-body' });
    const win: Win = { app, el: el('div', { class: 'os-window' }), body, x: 0, y: 0 };
    title.append(el('span', {}, heading), el('button', { class: 'os-x', onclick: () => this.closeWin(win) }, '✕'));
    win.el.append(title, body);
    const n = this.wins.length;
    win.x = 140 + n * 36;
    win.y = 20 + n * 30;
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
        win.x = m.clientX - sx;
        win.y = Math.max(0, m.clientY - sy);
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
    w.body.replaceChildren();
    switch (w.app) {
      case 'tickets': this.renderTickets(w.body); break;
      case 'mail': this.renderMail(w.body); break;
      case 'kb': this.renderKb(w.body); break;
      case 'store': this.renderStore(w.body); break;
      case 'career': this.renderCareer(w.body); break;
      case 'hr': this.renderHr(w.body); break;
      case 'journal': this.renderJournal(w.body); break;
      case 'slack': this.renderSlack(w.body); break;
      case 'settings': this.renderSettings(w.body); break;
    }
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
      list.append(el('p', { class: 'os-dim' }, 'Queue empty. Nobody has thrown a ticket at you... yet.'));
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
        if (d.duck || perk(s, 'cli') > 0) {
          right.append(el('p', { class: 'os-note' }, `🦆 You explain it to the duck. The duck suggests: ${t.cause}`));
        }
        right.append(el('p', { class: 'os-dim' }, 'Apply a fix:'));
        const hint = this.host.fixHint(q);
        if (s.bac >= 42) right.append(el('p', { class: 'os-note' }, 'The words on the screen are swimming a bit.'));
        for (const label of this.host.fixOptions(q)) {
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

  // ---- Mail / quests ----

  private renderMail(body: HTMLElement): void {
    const s = this.host.save;
    body.append(el('p', { class: 'os-dim' }, 'Your inbox. Tasks from around the building. Finish them for Rep and Management standing.'));
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
      onclick: () => {
        const q = this.host.newQuest();
        this.say(q === null ? 'You already have three tasks on. Even you have limits.' : `New task: ${q.title}`);
      },
    }, active >= 3 ? 'Inbox full (3 tasks max)' : '📨 Check for new tasks'));
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
    for (const t of ['weapons', 'gear', 'supplies', 'ammo'] as const) {
      tabs.append(el('button', { class: `os-tab${this.storeTab === t ? ' is-selected' : ''}`, onclick: () => { this.storeTab = t; this.refresh(); } }, t[0]?.toUpperCase() + t.slice(1)));
    }
    body.append(el('p', { class: 'os-dim' }, this.mode === 'itdesk'
      ? '"Budget code? Right. Sign here, here and here. No, you cannot have admin rights." - Morag, Internal IT'
      : 'Internal IT Requisition Portal v3.1 - approvals are instant if you have the Rep. Prices follow your IT Crowd standing and Charm.'), tabs);
    const items: readonly ItemDef[] = this.storeTab === 'weapons' ? WEAPONS.filter((w) => w.price > 0)
      : this.storeTab === 'gear' ? GEAR : this.storeTab === 'supplies' ? CONSUMABLES.filter((c) => c.unsold !== true) : AMMO;
    const grid = el('div', { class: 'os-store' });
    for (const item of items) {
      const locked = item.minFloor > s.floor;
      const owned = (item.slot === 'weapon' || item.slot === 'head' || item.slot === 'body' || item.slot === 'feet' || item.slot === 'trinket') && s.owned.includes(item.id);
      const count = item.slot === 'consumable' ? s.consumables[item.id] ?? 0 : null;
      grid.append(el('div', { class: `os-item${locked ? ' is-locked' : ''}` },
        el('b', {}, item.name),
        el('p', {}, locked ? `Clearance required: floor ${item.minFloor + 1}.` : item.desc),
        el('p', { class: 'os-meta' }, `₡${this.host.price(item.price)} · ${item.weight} kg${count !== null ? ` · have ${count}` : ''}`),
        el('button', {
          class: 'os-btn',
          ...(locked || owned ? { disabled: 'true' } : {}),
          onclick: () => {
            const err = this.host.buy(item.id);
            if (err !== null) this.host.error();
            else this.host.coin();
            this.say(err ?? `${item.name}: requisition approved.`);
          },
        }, owned ? 'Issued' : locked ? 'Locked' : 'Requisition')));
    }
    body.append(grid);
    if (this.feedback !== '') body.append(el('p', { class: 'os-feedback' }, this.feedback));
  }

  // ---- Career ----

  private renderCareer(body: HTMLElement): void {
    const s = this.host.save;
    const d = this.host.derived();
    body.append(
      el('h3', {}, `${s.name} - ${this.host.title} (Level ${s.level})`),
      el('div', { class: 'os-bar' }, el('div', { class: 'os-bar-fill', style: `width:${Math.min(100, Math.round((s.skillUps / SKILL_UPS_PER_LEVEL) * 100))}%` })),
      el('p', { class: 'os-meta' }, `Skill increases toward next level: ${s.skillUps}/${SKILL_UPS_PER_LEVEL}${s.skillUps >= SKILL_UPS_PER_LEVEL ? ' - REST (T) TO LEVEL UP' : ''} · Rep ₡${s.rep} · Max sanity ${d.maxSanity} · Armour ${Math.round(d.armor * 100)}% · Speed ×${d.speedMult.toFixed(2)} · Dodge ${Math.round(d.dodge * 100)}%`),
      el('p', { class: `os-meta${d.overEncumbered ? ' is-alarm' : ''}` }, `Carrying ${d.weight}/${d.carry} kg${s.actionItems > 0 ? ` (incl. ${s.actionItems} action item${s.actionItems > 1 ? 's' : ''} at ${ACTION_ITEM_KG} kg each - office ladies can take them off you)` : ''}${s.empties > 0 ? ` (and ${s.empties} empties at ${EMPTY_KG} kg - return them at a bottle machine)` : ''}${d.overEncumbered ? ' - OVER-ENCUMBERED: slow, no sprinting' : ''}`),
    );
    // Attributes, with the level-up multiplier they have earned so far.
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
    body.append(el('h4', {}, 'Skills (★ major: learn 50% faster) - skills rise by use'), skills);
    if (s.spells.length > 0) {
      body.append(el('h4', {}, 'Runes known (X to select, F to cast)'), el('p', { class: 'os-meta' }, s.spells.map((id) => { const sp = spellById(id); return sp === undefined ? id : `${sp.name} (${sp.english}, ${sp.cost})`; }).join(' · ')));
    }
    body.append(el('p', { class: 'os-meta' }, `Promille ${(s.bac / 40).toFixed(2)}‰ · Dependency ${Math.round(s.dependency)}/100${s.dependency >= 50 ? ' (withdrawal when sober)' : ''}${s.hangover > 0 ? ' · hungover' : ''}`));

    // Equipment.
    const eq = el('div', { class: 'os-equip' });
    const slotRow = (slot: 'weapon' | 'head' | 'body' | 'feet' | 'trinket', label: string): void => {
      const options = s.owned.filter((id) => itemById(id)?.slot === slot);
      const sel = el('select', { class: 'os-input' });
      if (slot !== 'weapon') sel.append(el('option', { value: '' }, '(nothing)'));
      for (const id of options) {
        const o = el('option', { value: id }, itemById(id)?.name ?? id);
        if (s.equipped[slot] === id) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener('change', () => {
        this.host.equip(slot, sel.value === '' ? null : sel.value);
        this.refresh();
      });
      eq.append(el('label', {}, el('span', {}, label), sel));
    };
    slotRow('weapon', 'In hand');
    slotRow('head', 'Head');
    slotRow('body', 'Body');
    slotRow('feet', 'Feet');
    slotRow('trinket', 'Trinket');
    body.append(el('h4', {}, 'Equipment'), eq);
    const weapons = s.owned.filter((id) => itemById(id)?.slot === 'weapon');
    body.append(el('p', { class: 'os-meta' }, `Hotbar: ${weapons.map((id, i) => `[${i + 1}] ${itemById(id)?.name ?? id}`).join('  ')}`));
    body.append(el('p', { class: 'os-meta' }, `Ammo: labels ${s.ammo.labels} · air ${s.ammo.air} · ducks ${s.ammo.ducks} · toner ${s.ammo.toner}`));

    // Consumables.
    const packs = el('div', { class: 'os-store' });
    for (const c of CONSUMABLES) {
      const n = s.consumables[c.id] ?? 0;
      if (n <= 0) continue;
      packs.append(el('div', { class: 'os-item' }, el('b', {}, `${c.name} ×${n}`), el('p', {}, c.desc),
        el('button', { class: 'os-btn', onclick: () => { this.host.use(c.id); this.refresh(); } }, 'Use')));
    }
    const laptop = s.consumables.laptop ?? 0;
    if (laptop > 0) packs.append(el('div', { class: 'os-item' }, el('b', {}, `Replacement laptop ×${laptop}`), el('p', {}, 'For a delivery task. Walk up to the recipient and press E.')));
    body.append(el('h4', {}, 'Supplies (Q uses the first one)'), packs);

    // Perks.
    body.append(el('h4', {}, `Perks - ${s.perkPoints} point${s.perkPoints === 1 ? '' : 's'} to spend`));
    const perks = el('div', { class: 'os-store' });
    for (const p of PERKS) {
      const rank = perk(s, p.id);
      perks.append(el('div', { class: 'os-item' },
        el('b', {}, `${p.name} ${rank}/${p.max}`),
        el('p', {}, p.desc),
        el('button', {
          class: 'os-btn',
          ...(s.perkPoints <= 0 || rank >= p.max ? { disabled: 'true' } : {}),
          onclick: () => { this.host.spendPerk(p.id); this.refresh(); },
        }, rank >= p.max ? 'Maxed' : 'Learn')));
    }
    body.append(perks);
    body.append(el('p', { class: 'os-meta' }, `Field resolutions ${s.stats.resolvedField} · Desk resolutions ${s.stats.resolvedDesk} · SLA breaches ${s.stats.breaches} · Burnouts ${s.stats.burnouts} · Bosses ${s.stats.bosses}`));
  }

  // ---- HR ----

  private renderHr(body: HTMLElement): void {
    const s = this.host.save;
    const next = s.rung + 1;
    body.append(
      el('h3', {}, `${s.name}: ${this.host.title}`),
      el('p', { class: 'os-meta' }, `Rung ${s.rung + 1} of 9 · difficulty ×${difficultyFor(s.rung).toFixed(2)} · salary ₡${salaryFor(s.rung)} a week (paid at the mökki)`),
    );
    if (s.domain !== null && s.track !== null) {
      body.append(el('p', { class: 'os-note' }, `${s.domain} - ${DOMAIN_INFO[s.domain].desc} · ${TRACK_INFO[s.track].name}: ${TRACK_INFO[s.track].desc}`));
    }
    if (next < 9) {
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

  private renderJournal(body: HTMLElement): void {
    const s = this.host.save;
    if (s.journal.length === 0) {
      body.append(el('p', { class: 'os-dim' }, 'Nothing written yet.'));
      return;
    }
    for (const j of [...s.journal].reverse()) {
      body.append(el('div', { class: 'os-mail' }, el('p', { class: 'os-meta' }, j.floor === 0 ? 'B1' : `Floor ${j.floor}`), el('p', {}, j.text)));
    }
  }

  // ---- Slack ----

  private renderSlack(body: HTMLElement): void {
    const cats = ['(=^･ω･^=)', '(^・ω・^ )', 'ฅ^•ﻌ•^ฅ', '(=｀ω´=)', '/ᐠ｡ꞈ｡ᐟ\\'];
    body.append(
      el('div', { class: 'os-cat' }, fx.pick(cats)),
      el('p', {}, 'Slacking restores sanity. It is genuinely optimal play. But if a manager walks past...'),
      el('button', {
        class: 'os-btn',
        ...(this.host.canSlack() ? {} : { disabled: 'true' }),
        onclick: () => this.say(this.host.slackOff()),
      }, this.host.canSlack() ? 'Look at cats for five minutes' : 'You have already slacked at this desk'),
    );
    if (this.feedback !== '') body.append(el('p', { class: 'os-feedback' }, this.feedback));
  }

  private renderSettings(body: HTMLElement): void {
    const s = this.host.save;
    const view = el('select', { class: 'os-input' },
      el('option', { value: 'third', ...(s.view === 'third' ? { selected: 'true' } : {}) }, 'Third person'),
      el('option', { value: 'first', ...(s.view === 'first' ? { selected: 'true' } : {}) }, 'First person'));
    view.addEventListener('change', () => this.host.setView(view.value === 'first' ? 'first' : 'third'));
    const sens = el('input', { type: 'range', min: '0.2', max: '3', step: '0.1', value: String(s.mouseSens) });
    sens.addEventListener('input', () => this.host.setSens(Number(sens.value)));
    const vol = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume) });
    const bloom = el('select', { class: 'os-input' },
      el('option', { value: 'on', ...(s.bloom ? { selected: 'true' } : {}) }, 'On (glow)'),
      el('option', { value: 'off', ...(!s.bloom ? { selected: 'true' } : {}) }, 'Off (faster)'));
    bloom.addEventListener('change', () => this.host.setBloom(bloom.value === 'on'));
    vol.addEventListener('input', () => this.host.setVolume(Number(vol.value)));
    body.append(
      el('div', { class: 'os-equip' },
        el('label', {}, el('span', {}, 'Camera (V)'), view),
        el('label', {}, el('span', {}, 'Mouse sensitivity'), sens),
        el('label', {}, el('span', {}, 'Volume'), vol),
        el('label', {}, el('span', {}, 'Bloom'), bloom)),
      el('h4', {}, 'Controls'),
      el('pre', { class: 'os-pre' }, [
        'WASD move · Shift sprint · Space jump · Mouse look',
        'LMB use tool · 1-9 / wheel switch tool · Q quick-use supplies',
        'E interact / talk (talk angry people down, negotiate with managers)',
        'F cast rune · X next rune · G domain ability · C sneak · T rest (level up)',
        'RMB shove · V first/third person · Tab backpack · M map · Esc pause',
      ].join('\n')),
      el('button', {
        class: 'os-btn os-danger',
        onclick: () => {
          if (confirm('Resign and start a new career? Your save will be replaced.')) this.host.restart();
        },
      }, 'Resign (new game)'),
    );
  }
}
