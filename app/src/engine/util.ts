import { FPS } from './config';

export type Ease = (t: number) => number;

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const remap = (x: number, a: number, b: number, c = 0, d = 1) => c + ((d - c) * (x - a)) / (b - a);
export const cremap = (x: number, a: number, b: number, c = 0, d = 1) => c + (d - c) * clamp((x - a) / (b - a));
export const fract = (x: number) => x - Math.floor(x);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inQuart: (t: number) => t ** 4,
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  inExpo: (t: number) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  inSine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  outBackSoft: (t: number) => 1 + 1.9 * (t - 1) ** 3 + 0.9 * (t - 1) ** 2,
};

/** eased 0→1 progress of t through [a, b] */
export const prog = (t: number, a: number, b: number, e: Ease = ease.linear) => e(clamp((t - a) / (b - a)));

/** smooth in/out window: 0 before a, 1 inside, 0 after b */
export const window01 = (t: number, a: number, b: number, fin = 0.3, fout = fin) =>
  smoothstep(a, a + Math.max(1e-4, fin), t) * (1 - smoothstep(b - Math.max(1e-4, fout), b, t));

/** keyframes [[time, value, easeIntoThisKey?], ...] (sorted by time) */
export function keys(t: number, ks: [number, number, Ease?][]): number {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [t1, v1, e] = ks[i];
    if (t <= t1) {
      const [t0, v0] = ks[i - 1];
      return lerp(v0, v1, (e ?? ease.inOutCubic)(clamp((t - t0) / (t1 - t0 || 1))));
    }
  }
  return ks[ks.length - 1][1];
}

/** critically-damped-ish spring response to a step at t0 (pure function of t) */
export function spring(t: number, t0: number, freq = 3, damp = 0.45): number {
  if (t <= t0) return 0;
  const x = t - t0;
  const w = TAU * freq;
  return 1 - Math.exp(-damp * w * x) * Math.cos(w * Math.sqrt(1 - damp * damp) * x);
}

// ---- deterministic randomness -------------------------------------------

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** integer hash → [0, 1) */
export function hash(...n: number[]): number {
  let h = 0x811c9dc5;
  for (const v of n) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

/** smooth value noise in [-1, 1] */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed), hash(i + 1, seed), u) * 2 - 1;
}

export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

export function fbm1(x: number, seed = 0, oct = 3): number {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise1(x * f, seed + i * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

/** frame index: constant across the motion-blur shutter (sub-frames are t ∈ [k/FPS, (k+1)/FPS)) */
export const frameIdx = (t: number) => Math.floor(t * FPS + 1e-6);

// ---- geometry ------------------------------------------------------------

export type Pt = [number, number];

export function polyLengths(pts: Pt[]): number[] {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return L;
}

/** point + tangent angle at arc length s along a polyline */
export function pointAt(pts: Pt[], L: number[], s: number): { x: number; y: number; a: number } {
  s = clamp(s, 0, L[L.length - 1]);
  let i = 1;
  while (i < L.length - 1 && L[i] < s) i++;
  const seg = L[i] - L[i - 1] || 1;
  const k = (s - L[i - 1]) / seg;
  const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
  return { x: lerp(x0, x1, k), y: lerp(y0, y1, k), a: Math.atan2(y1 - y0, x1 - x0) };
}
