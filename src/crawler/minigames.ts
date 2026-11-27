import { fx } from './rng';
import { FISH, type FishDef } from './upgrades';

/**
 * Fishing off the end of the laituri: wait for the bite, then keep the fish
 * inside the green band while it pulls. Hold Space (or the mouse) to reel in;
 * let go to give it line. Tension too high and the line snaps.
 */
export class FishingUI {
  private readonly root: HTMLDivElement;
  private raf = 0;
  open = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dlg-wrap';
    this.root.style.display = 'none';
    parent.append(this.root);
  }

  start(skillBonus: number, done: (fish: FishDef | null) => void): void {
    this.open = true;
    this.root.style.display = 'flex';
    const roll = fx.next();
    let acc = 0;
    let fish: FishDef = FISH[0] as FishDef;
    for (const f of FISH) {
      acc += f.weight;
      if (roll <= acc) {
        fish = f;
        break;
      }
    }
    this.root.innerHTML = `
      <div class="dlg fish">
        <div class="dlg-head"><b>Fishing off the laituri</b><span>The white night. A loon somewhere.</span></div>
        <p class="dlg-text fish-status">Waiting for a bite...</p>
        <div class="lock-bar fish-bar"><div class="lock-zone fish-zone"></div><div class="lock-marker fish-marker"></div></div>
        <div class="fish-meter"><div class="fish-meter-fill"></div></div>
        <p class="lock-status">Hold <b>Space</b> (or the mouse button) to reel in. Keep the fish in the green.</p>
        <div class="dlg-opts"><button class="dlg-opt fish-quit">Pack up (Esc)</button></div>
      </div>`;
    const status = this.root.querySelector<HTMLParagraphElement>('.fish-status');
    const zoneEl = this.root.querySelector<HTMLDivElement>('.fish-zone');
    const marker = this.root.querySelector<HTMLDivElement>('.fish-marker');
    const meter = this.root.querySelector<HTMLDivElement>('.fish-meter-fill');
    let reeling = false;
    let phase: 'wait' | 'fight' = 'wait';
    let waitT = fx.range(1.2, 3.5);
    let fishPos = 0.5;
    let fishVel = 0;
    let zonePos = 0.5;
    let progress = 0.25;
    const zoneW = Math.max(0.12, Math.min(0.45, (0.22 + skillBonus / 300) * fish.difficulty));
    let last = performance.now();
    const finish = (caught: boolean): void => {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('mouseup', mup);
      this.open = false;
      this.root.style.display = 'none';
      this.root.replaceChildren();
      done(caught ? fish : null);
    };
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        e.preventDefault();
        reeling = true;
      } else if (e.code === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') reeling = false;
    };
    const mup = (): void => {
      reeling = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mouseup', mup);
    this.root.querySelector('.fish-bar')?.addEventListener('mousedown', () => { reeling = true; });
    this.root.querySelector('.fish-quit')?.addEventListener('click', () => finish(false));
    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (phase === 'wait') {
        waitT -= dt;
        if (waitT <= 0) {
          phase = 'fight';
          if (status !== null) status.textContent = 'A bite! Something is pulling hard.';
        }
      } else {
        // The fish darts about; reeling pushes your band right, slack lets it drift left.
        fishVel += fx.range(-1, 1) * dt * 6 * (1.5 - fish.difficulty * 0.5);
        fishVel *= 0.96;
        fishPos = Math.max(0.02, Math.min(0.98, fishPos + fishVel * dt));
        zonePos += (reeling ? 0.9 : -0.7) * dt;
        zonePos = Math.max(zoneW / 2, Math.min(1 - zoneW / 2, zonePos));
        const inside = Math.abs(fishPos - zonePos) < zoneW / 2;
        progress += (inside ? 0.22 : -0.16) * dt;
        if (progress >= 1) {
          finish(true);
          return;
        }
        if (progress <= 0) {
          if (status !== null) status.textContent = 'Snap. It got away.';
          finish(false);
          return;
        }
      }
      if (zoneEl !== null) {
        zoneEl.style.left = `${(zonePos - zoneW / 2) * 100}%`;
        zoneEl.style.width = `${zoneW * 100}%`;
      }
      if (marker !== null) marker.style.left = `${fishPos * 100}%`;
      if (meter !== null) meter.style.width = `${Math.max(0, progress) * 100}%`;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
