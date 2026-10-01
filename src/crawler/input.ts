import { DEFAULT_KEYS, mouseCode } from './settings';

/**
 * Keyboard + mouse, with pointer lock for mouse-look. Mouse buttons are
 * held and pressed under codes of their own ('Mouse0' the left, 'Mouse2' the
 * right) in the same sets as the keys, so every action can be bound to
 * either, attack and block included.
 */
export class Input {
  readonly keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  /** What attack and block are bound to (`bind`): the left and right buttons until rebound. */
  private attackCode = DEFAULT_KEYS.attack;
  private blockCode = DEFAULT_KEYS.block;
  wheel = 0;
  locked = false;
  enabled = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // Never steal keys from a text box (the badge name, the KB search).
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (e.code === 'Tab' || e.code === 'Space' || (this.locked && e.code.startsWith('Alt'))) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.requestLock();
        return;
      }
      const code = mouseCode(e.button);
      if (!this.keys.has(code)) this.pressed.add(code);
      this.keys.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      this.keys.delete(mouseCode(e.button));
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      // The buttons only reach the game while the mouse is captured: let go of them all.
      if (!this.locked) for (const k of this.keys) if (k.startsWith('Mouse')) this.keys.delete(k);
    });
  }

  requestLock(): void {
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p instanceof Promise) p.catch(() => undefined);
    } catch {
      // Some browsers refuse outside a gesture; the next click retries.
    }
  }

  /**
   * The game let go of the mouse itself (a menu, a dialogue, the title).
   * Only set when there was a lock to let go of, so it always pairs with
   * the one loss that follows, and `lostOnPurpose` takes it.
   */
  private releasing = false;

  releaseLock(): void {
    if (document.pointerLockElement === null) return;
    this.releasing = true;
    document.exitPointerLock();
  }

  /**
   * Asked once when the lock has been lost: was it our own `releaseLock`
   * (true), or the browser taking it away (Esc, alt-tab: false)? Clears the
   * answer, so the next loss is judged on its own.
   */
  lostOnPurpose(): boolean {
    const ours = this.releasing;
    this.releasing = false;
    return ours;
  }

  /** True once per physical key press. */
  hit(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Attack and block follow the Control Panel (`Game.applySettings`). */
  bind(attack: string, block: string): void {
    this.attackCode = attack;
    this.blockCode = block;
  }

  /** The attack button (LMB unless rebound) is held. */
  get lmb(): boolean {
    return this.keys.has(this.attackCode);
  }

  /** The block button (RMB unless rebound) is held. */
  get rmb(): boolean {
    return this.keys.has(this.blockCode);
  }

  /**
   * Scripted presses, for the balance bot (scripts/helldesk-balance): hold
   * or let go of attack or block, or press attack once, on whatever they are
   * bound to, through the same sets a real press goes into. `lmb` and `rmb`
   * are read-only views of the bindings; assigning them is not a way in.
   */
  holdAttack(down: boolean): void {
    if (down) this.keys.add(this.attackCode);
    else this.keys.delete(this.attackCode);
  }

  tapAttack(): void {
    this.pressed.add(this.attackCode);
  }

  holdBlock(down: boolean): void {
    if (down) this.keys.add(this.blockCode);
    else this.keys.delete(this.blockCode);
  }

  /** The attack button went down this frame. */
  clicked(): boolean {
    return this.pressed.has(this.attackCode);
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }
}
