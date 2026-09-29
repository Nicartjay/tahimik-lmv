// Impacts and transitions shared by the MV scenes, all pure functions of t: decaying hit
// pulses → flash / chromatic kick / frame-random shake, the dive curves for match cuts
// through the firefly, a fullscreen fill, and a shockwave chunk for line warp hooks.

import type { AudioData } from '../../engine/audio';
import { Pass, type RT } from '../../engine/gl';
import { lin, type RGB } from '../../engine/palette';
import { POST_DEFAULTS, type Post } from '../../engine/scene';
import { ease, frameIdx, hash, lerp, prog, smoothstep, type Ease } from '../../engine/util';
import { mul } from '../../engine/3d/math';

/** the strongest exp(−Δt/τ) of the hits at or before t (0 when none is recent) */
export function decay(t: number, times: number[], tau = 0.25): number {
  let s = 0;
  for (const h of times) if (t >= h && t - h < tau * 8) s = Math.max(s, Math.exp(-(t - h) / tau));
  return s;
}

export interface ImpactOpts {
  /** peak flash to paper (0..1) */
  flash?: number;
  /** peak chromatic aberration */
  ca?: number;
  /** peak shake, logical px */
  shake?: number;
  tau?: number;
  seed?: number;
}

/** post for impacts at `times`: flash (decays twice as fast), CA kick, shake new every frame */
export function impact(t: number, times: number[], o: ImpactOpts = {}): Post {
  const k = decay(t, times, o.tau ?? 0.22);
  if (k <= 0) return {};
  const f = frameIdx(t), s = (o.shake ?? 10) * k, sd = o.seed ?? 0;
  return {
    flash: (o.flash ?? 0) * k * k,
    ca: (o.ca ?? 0.8) * k,
    shake: [(hash(f, sd, 1) * 2 - 1) * s, (hash(f, sd, 2) * 2 - 1) * s],
  };
}

/** combine post parts: flash, ca and shake add; everything else, the last one wins */
export function mergePost(...ps: (Post | void)[]): Post {
  const out: Post = {};
  for (const p of ps) {
    if (!p) continue;
    const { flash, ca, shake, ...rest } = p;
    Object.assign(out, rest);
    if (flash) out.flash = (out.flash ?? 0) + flash;
    if (ca) out.ca = (out.ca ?? 0) + ca;
    if (shake) out.shake = [(out.shake?.[0] ?? 0) + shake[0], (out.shake?.[1] ?? 0) + shake[1]];
  }
  return out;
}

/** 0 → 1 over the last `dur` s before `cut`: the push into the light that ends a shot */
export const diveOut = (t: number, cut: number, dur = 0.5, e: Ease = ease.inCubic) => prog(t, cut - dur, cut, e);
/** 1 → 0 over the first `dur` s after `start`: the next shot opening out of the light */
export const diveIn = (t: number, start: number, dur = 0.6, e: Ease = ease.outCubic) => 1 - prog(t, start, start + dur, e);

/**
 * The light every dive and flare passes through: firefly gold, hot enough to bloom to
 * near white. At a match cut both shots are covered by `Fill.draw(out, DIVE_COL, 1,
 * 'over')` and carry DIVE_POST, so the frames either side of the cut are the same.
 */
export const DIVE_COL: RGB = mul(lin('glow'), 2.2);
export const DIVE_POST = { exposure: 1, bloom: 0.9, vignette: 0.3, grain: 0.035 } as const;

/** a scene's post eased towards DIVE_POST as its dive fill `k` (0..1) nears 1 */
export function towardDive(p: Post, k: number): Post {
  const w = smoothstep(0.5, 1, k);
  if (w <= 0) return p;
  const out: Post = { ...p };
  for (const key of ['exposure', 'bloom', 'vignette', 'grain'] as const) out[key] = lerp(p[key] ?? POST_DEFAULTS[key], DIVE_POST[key], w);
  return out;
}

/** beat times in [t0, t1), every `every` beats (from beat index `phase`) */
export function beats(A: AudioData, t0: number, t1: number, every = 1, phase = 0): number[] {
  const out: number[] = [];
  let k = Math.ceil((A.beatAt(t0) - phase - 1e-6) / every) * every + phase;
  for (let t = A.timeOfBeat(k); t < t1; t = A.timeOfBeat((k += every))) out.push(t);
  return out;
}
/** downbeats (bar starts) in [t0, t1) */
export function bars(A: AudioData, t0: number, t1: number, every = 1): number[] {
  const out: number[] = [];
  for (let k = Math.ceil(A.barAt(t0) - 1e-6); A.timeOfBar(k) < t1; k += every) out.push(A.timeOfBar(k));
  return out;
}

const FILL = /* glsl */ `
uniform vec3 uCol; uniform float uA;
void main() { fragColor = vec4(uCol * uA, uA); }`;

/** a flat fullscreen colour: 'add' light (a whiteout) or 'over' paint (a veil) */
export class Fill {
  private pass = new Pass(FILL);
  draw(out: RT, col: RGB, a: number, mode: 'add' | 'over' = 'add') {
    if (a > 0) this.pass.draw(out, { uCol: col, uA: a }, mode);
  }
}

/**
 * A shockwave for warp hooks: a ring leaving uShockC at song time uShockT at uShockV m/s
 * lifts and pushes out whatever it passes, decaying with age. Needs `uniform float uNow`
 * (song time); call `p = shock(p);` in warp.
 */
export const GLSL_SHOCK = /* glsl */ `
uniform vec3 uShockC;
uniform float uShockT, uShockV, uShockA, uNow;
vec3 shock(vec3 p) {
  float age = uNow - uShockT;
  if (age < 0. || uShockA <= 0.) return p;
  vec2 d = p.xz - uShockC.xz;
  float r = length(d), x = r - age * uShockV, w = 1.2 + age * .8;
  float k = exp(-x * x / (w * w)) * uShockA * exp(-age * .8) / (1. + r * .05);
  p.y += k;
  p.xz += d / max(r, 1e-3) * k * .4;
  return p;
}`;

export const shockUniforms = (now: number, at: number, c: [number, number, number] = [0, 0, 0], amp = 1, speed = 14) => ({
  uNow: now, uShockT: at, uShockC: c, uShockA: amp, uShockV: speed,
});
