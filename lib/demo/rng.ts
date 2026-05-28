// Deterministic seeded RNG so every render produces the same illustrative numbers.
// Mulberry32 — small, fast, good enough for visual demo data.

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

export function range(r: () => number, lo: number, hi: number): number {
  return Math.round(lo + r() * (hi - lo));
}

export function floatRange(r: () => number, lo: number, hi: number, decimals = 2): number {
  const v = lo + r() * (hi - lo);
  const m = 10 ** decimals;
  return Math.round(v * m) / m;
}
