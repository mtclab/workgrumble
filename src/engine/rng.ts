export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<Item>(items: readonly Item[]): Item;
  fork(label: string): Rng;
}

const UINT32_RANGE = 4_294_967_296;
const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new TypeError('RNG seed must be a finite number.');
  }

  return seed >>> 0;
}

function hashLabel(label: string): number {
  let hash = FNV32_OFFSET;

  for (let index = 0; index < label.length; index += 1) {
    const codeUnit = label.charCodeAt(index);
    hash ^= codeUnit & 0xff;
    hash = Math.imul(hash, FNV32_PRIME);
    hash ^= codeUnit >>> 8;
    hash = Math.imul(hash, FNV32_PRIME);
  }

  return hash >>> 0;
}

function mixSeeds(parentSeed: number, labelHash: number): number {
  let mixed = parentSeed ^ labelHash ^ 0x9e3779b9;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

class Mulberry32Rng implements Rng {
  private state: number;

  public constructor(private readonly seed: number) {
    this.state = seed;
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }

  public int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new TypeError('RNG integer bounds must be safe integers.');
    }

    if (max < min) {
      throw new RangeError('RNG maximum must be greater than or equal to minimum.');
    }

    const range = max - min + 1;

    if (!Number.isSafeInteger(range)) {
      throw new RangeError('RNG integer range is too large.');
    }

    return min + Math.floor(this.next() * range);
  }

  public pick<Item>(items: readonly Item[]): Item {
    if (items.length === 0) {
      throw new RangeError('Cannot pick from an empty array.');
    }

    const index = this.int(0, items.length - 1);
    return items[index] as Item;
  }

  public fork(label: string): Rng {
    return new Mulberry32Rng(mixSeeds(this.seed, hashLabel(label)));
  }
}

export function createRng(seed: number): Rng {
  return new Mulberry32Rng(normalizeSeed(seed));
}

