import { fx } from './rng';

/**
 * The conversation window. Morrowind-shaped: who you are talking to, what
 * they said, and a list of things you could say back - some of them with a
 * skill check and the odds printed next to them, so a choice is a choice.
 */

export interface DialogueOption {
  readonly label: string;
  /** e.g. "Soft Skills 64%". Shown in brackets before the line. */
  readonly tag?: string;
  readonly disabled?: boolean;
  /** Return the next node, or null to end the conversation. */
  readonly pick: () => DialogueNode | null;
}

export interface DialogueNode {
  readonly speaker: string;
  readonly subtitle?: string;
  readonly text: string;
  readonly options: readonly DialogueOption[];
  readonly mood?: 'neutral' | 'good' | 'bad' | 'mystic';
}

export class DialogueUI {
  private readonly root: HTMLDivElement;
  private onClose: (() => void) | null = null;
  open = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dlg-wrap';
    this.root.style.display = 'none';
    parent.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (!this.open || e.repeat) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) {
        const btn = this.root.querySelectorAll<HTMLButtonElement>('.dlg-opt')[n - 1];
        if (btn !== undefined && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      }
    });
  }

  show(node: DialogueNode, onClose: () => void): void {
    this.onClose = onClose;
    this.open = true;
    this.render(node);
    this.root.style.display = 'flex';
  }

  private render(node: DialogueNode): void {
    this.root.replaceChildren();
    const box = document.createElement('div');
    box.className = `dlg dlg-${node.mood ?? 'neutral'}`;
    const head = document.createElement('div');
    head.className = 'dlg-head';
    head.innerHTML = `<b></b><span></span>`;
    (head.firstChild as HTMLElement).textContent = node.speaker;
    (head.lastChild as HTMLElement).textContent = node.subtitle ?? '';
    const text = document.createElement('p');
    text.className = 'dlg-text';
    text.textContent = node.text;
    const opts = document.createElement('div');
    opts.className = 'dlg-opts';
    node.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'dlg-opt';
      b.disabled = o.disabled === true;
      b.innerHTML = `<span class="dlg-n">${i + 1}.</span> ${o.tag !== undefined ? '<span class="dlg-tag"></span> ' : ''}<span class="dlg-l"></span>`;
      const tag = b.querySelector('.dlg-tag');
      if (tag !== null) tag.textContent = `[${o.tag ?? ''}]`;
      const l = b.querySelector('.dlg-l');
      if (l !== null) l.textContent = o.label;
      b.addEventListener('click', () => {
        const next = o.pick();
        if (next === null) this.close();
        else this.render(next);
      });
      opts.append(b);
    });
    box.append(head, text, opts);
    this.root.append(box);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.style.display = 'none';
    this.root.replaceChildren();
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}

/** A simple end-of-conversation node. */
export function said(speaker: string, text: string, mood: DialogueNode['mood'] = 'neutral', leave = 'Leave'): DialogueNode {
  return { speaker, text, mood, options: [{ label: leave, pick: () => null }] };
}

// ---------------------------------------------------------------- lockpicking

/**
 * Three pins. A marker sweeps a bar; press Space/E (or click) while it is in
 * the green. The green shrinks with the lock and grows with your Security.
 * A miss breaks a paperclip.
 */
export class LockpickUI {
  private readonly root: HTMLDivElement;
  private raf = 0;
  open = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dlg-wrap';
    this.root.style.display = 'none';
    parent.append(this.root);
  }

  start(
    lock: number,
    security: number,
    clips: () => number,
    onMiss: () => void,
    done: (success: boolean) => void,
    zoneMult = 1,
  ): void {
    this.open = true;
    this.root.style.display = 'flex';
    const width = Math.max(0.06, Math.min(0.6, (0.2 + (security - lock) / 200) * zoneMult));
    let pin = 0;
    let t = 0;
    let last = performance.now();
    let zone = 0.3;
    const pins = 3;
    this.root.innerHTML = `
      <div class="dlg lock">
        <div class="dlg-head"><b>Supply closet</b><span>Lock ${lock} · your Security ${security}</span></div>
        <p class="dlg-text">Bend the paperclip. Feel for the pin. Press <b>Space</b> when the marker is in the green.</p>
        <div class="lock-bar"><div class="lock-zone"></div><div class="lock-marker"></div></div>
        <p class="lock-status"></p>
        <div class="dlg-opts"><button class="dlg-opt lock-quit">Give up (Esc)</button></div>
      </div>`;
    const zoneEl = this.root.querySelector<HTMLDivElement>('.lock-zone');
    const marker = this.root.querySelector<HTMLDivElement>('.lock-marker');
    const status = this.root.querySelector<HTMLParagraphElement>('.lock-status');
    const place = (): void => {
      zone = fx.range(0.1, 0.9 - width);
      if (zoneEl !== null) {
        zoneEl.style.left = `${zone * 100}%`;
        zoneEl.style.width = `${width * 100}%`;
      }
      if (status !== null) status.textContent = `Pin ${pin + 1} of ${pins} · paperclips left: ${clips()}`;
    };
    place();
    const finish = (ok: boolean): void => {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('keydown', key);
      this.open = false;
      this.root.style.display = 'none';
      this.root.replaceChildren();
      done(ok);
    };
    const attempt = (): void => {
      const pos = (Math.sin(t) + 1) / 2;
      if (pos >= zone && pos <= zone + width) {
        pin++;
        if (pin >= pins) {
          finish(true);
          return;
        }
        place();
      } else {
        onMiss();
        if (clips() <= 0) {
          finish(false);
          return;
        }
        if (status !== null) status.textContent = `Snap. Pin ${pin + 1} of ${pins} · paperclips left: ${clips()}`;
      }
    };
    const key = (e: KeyboardEvent): void => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'KeyE') {
        e.preventDefault();
        attempt();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };
    window.addEventListener('keydown', key);
    this.root.querySelector('.lock-bar')?.addEventListener('mousedown', attempt);
    this.root.querySelector('.lock-quit')?.addEventListener('click', () => finish(false));
    const speed = 2.2 + lock / 40;
    const tick = (now: number): void => {
      t += ((now - last) / 1000) * speed;
      last = now;
      if (marker !== null) marker.style.left = `${((Math.sin(t) + 1) / 2) * 100}%`;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
