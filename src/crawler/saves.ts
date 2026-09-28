/**
 * Save slots, the old way: an autosave, a quicksave (F5 / F9) and three
 * manual slots. Everything lives in this browser's localStorage and every
 * access is guarded - a private window just means nothing is kept.
 */

export type SlotId = 'auto' | 'quick' | 'slot1' | 'slot2' | 'slot3';

export const SLOT_IDS: readonly SlotId[] = ['auto', 'quick', 'slot1', 'slot2', 'slot3'];

export const SLOT_LABEL: Record<SlotId, string> = {
  auto: 'Autosave',
  quick: 'Quicksave',
  slot1: 'Slot 1',
  slot2: 'Slot 2',
  slot3: 'Slot 3',
};

export interface SlotMeta {
  readonly id: SlotId;
  readonly name: string;
  readonly title: string;
  readonly where: string;
  readonly level: number;
  readonly savedAt: number;
}

const PREFIX = 'workgrumble-helldesk-v3-';

function key(id: SlotId): string {
  return PREFIX + id;
}

export function writeSlot(id: SlotId, meta: Omit<SlotMeta, 'id' | 'savedAt'>, data: unknown): boolean {
  try {
    localStorage.setItem(key(id), JSON.stringify({ meta: { ...meta, id, savedAt: Date.now() }, data }));
    return true;
  } catch {
    return false;
  }
}

export function readSlot(id: SlotId): { meta: SlotMeta; data: unknown } | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { meta?: SlotMeta; data?: unknown };
    if (parsed.meta === undefined || parsed.data === undefined) return null;
    return { meta: parsed.meta, data: parsed.data };
  } catch {
    return null;
  }
}

export function listSlots(): SlotMeta[] {
  const out: SlotMeta[] = [];
  for (const id of SLOT_IDS) {
    const s = readSlot(id);
    if (s !== null) out.push(s.meta);
  }
  return out;
}

export function latestSlot(): SlotId | null {
  let best: SlotMeta | null = null;
  for (const m of listSlots()) if (best === null || m.savedAt > best.savedAt) best = m;
  return best?.id ?? null;
}

export function deleteSlot(id: SlotId): void {
  try {
    localStorage.removeItem(key(id));
  } catch {
    // Nothing to delete.
  }
}

export function clearAllSlots(): void {
  for (const id of SLOT_IDS) deleteSlot(id);
}

export function timeAgo(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
