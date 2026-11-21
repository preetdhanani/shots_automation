/**
 * Deterministic seeded PRNG utilities (browser-safe).
 */

export type RngFn = () => number;

export function createSeededRng(seed: number): RngFn {
  let state = (seed | 0) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface WeightedItem<T> {
  item: T;
  weight: number;
}

export function weightedPick<T>(items: readonly WeightedItem<T>[], rng: RngFn): T {
  if (items.length === 0) {
    throw new Error('weightedPick requires at least one item.');
  }
  const positive = items.map((entry) => ({
    item: entry.item,
    weight: Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 0,
  }));
  const total = positive.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) {
    const idx = Math.min(items.length - 1, Math.floor(rng() * items.length));
    return items[idx]!.item;
  }
  let target = rng() * total;
  for (const entry of positive) {
    target -= entry.weight;
    if (target <= 0) {
      return entry.item;
    }
  }
  return positive[positive.length - 1]!.item;
}
