/**
 * A Skyrim-style compass strip across the top of the screen: cardinal
 * points, plus markers for quest objectives and places that matter, sliding
 * as you turn. Markers carry a distance so near things read as near.
 */

export interface CompassMarker {
  readonly x: number;
  readonly z: number;
  readonly icon: string;
  readonly color: string;
  readonly label: string;
}

const FOV = Math.PI * 0.75;

export class Compass {
  private readonly root: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private readonly pool: HTMLDivElement[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'compass';
    this.strip = document.createElement('div');
    this.strip.className = 'compass-strip';
    this.root.append(this.strip);
    parent.append(this.root);
  }

  set visible(v: boolean) {
    this.root.style.display = v ? 'block' : 'none';
  }

  /** `yaw` is the player's facing (0 = north, i.e. -z; increasing turns left). */
  update(px: number, pz: number, yaw: number, markers: readonly CompassMarker[]): void {
    const items: { angle: number; text: string; color: string; cls: string; title: string; distance?: number }[] = [];
    const cardinals: [string, number][] = [['N', 0], ['NE', -Math.PI / 4], ['E', -Math.PI / 2], ['SE', (-3 * Math.PI) / 4], ['S', Math.PI], ['SW', (3 * Math.PI) / 4], ['W', Math.PI / 2], ['NW', Math.PI / 4]];
    for (const [t, a] of cardinals) items.push({ angle: a, text: t, color: t.length === 1 ? '#f0e8d8' : '#9a9282', cls: 'compass-card', title: '' });
    for (const m of [...markers].sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz))) {
      // World angle of the marker, in the same convention as yaw.
      const angle = Math.atan2(-(m.x - px), -(m.z - pz));
      const dist = Math.round(Math.hypot(m.x - px, m.z - pz));
      items.push({ angle, text: `${m.icon}<small>${dist}m</small>`, color: m.color, cls: 'compass-marker', title: m.label, distance: dist });
    }
    const width = this.strip.clientWidth || 560;
    const occupied: { left: number; right: number }[] = [];
    let used = 0;
    for (const it of items) {
      let rel = yaw - it.angle;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      // Markers outside the strip are pinned to its edge so you know which way to turn.
      const pinned = it.cls === 'compass-marker' && Math.abs(rel) > FOV / 2;
      if (Math.abs(rel) > FOV / 2 && !pinned) continue;
      let x = 50 + (Math.max(-FOV / 2, Math.min(FOV / 2, rel)) / (FOV / 2)) * 50;
      if (it.distance !== undefined) {
        // Nearest first: leave space for each distance label, including at the edges.
        const half = Math.max(16, (String(it.distance).length + 1) * 3 + 6);
        const center = Math.max(half, Math.min(width - half, x * width / 100));
        if (occupied.some((p) => center - half < p.right + 8 && center + half > p.left - 8)) continue;
        occupied.push({ left: center - half, right: center + half });
        x = center / width * 100;
      }
      let el = this.pool[used];
      if (el === undefined) {
        el = document.createElement('div');
        this.strip.append(el);
        this.pool.push(el);
      }
      used++;
      el.className = `${it.cls}${pinned ? ' is-pinned' : ''}`;
      el.style.left = `${x}%`;
      el.style.color = it.color;
      el.innerHTML = it.text;
      el.title = it.title;
      el.style.display = 'block';
    }
    for (let i = used; i < this.pool.length; i++) {
      const el = this.pool[i];
      if (el !== undefined) el.style.display = 'none';
    }
  }
}
