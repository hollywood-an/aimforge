// Seedable PRNG for deterministic (challenge) runs. mulberry32 is tiny, fast,
// and plenty random for target placement — not for cryptography.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Decorrelate a per-target lane from the run seed (murmur3-style avalanche). */
export function deriveSeed(seed, n) {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function randomSeed() {
  return globalThis.crypto?.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0]
    : (Math.random() * 4294967296) >>> 0;
}

export function seedToString(seed) {
  return (seed >>> 0).toString(36);
}

/** Strict base36 uint32 parse — corrupted links are rejected, never reinterpreted. */
export function seedFromString(s) {
  if (typeof s !== 'string' || !/^[0-9a-z]{1,7}$/.test(s)) return null;
  const n = parseInt(s, 36);
  return n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
}
