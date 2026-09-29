// ALON's sea: the laughter as a line-mesh ocean. A world-fixed grid (drawn round a
// snapped origin that follows the camera) lifted in the warp hook by a swell and one giant
// solitary wave running +z at the shore, whose crest curls forward over the rock and
// collapses into foam; spray as closed-form ballistic points. `seaY` mirrors the unbroken
// surface on the CPU so words and the camera can ride it. Time `tau` is the sea's own
// clock: the scene slows it round the break.

import type { RT } from '../../engine/gl';
import { lin } from '../../engine/palette';
import { clamp, hash, smoothstep, TAU } from '../../engine/util';
import type { Basis } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, mul, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';

export interface SeaState {
  /** the sea's clock, seconds */
  tau: number;
  /** crest line (z), crest height, front width, curl 0..1 */
  zc: number;
  H: number;
  wf: number;
  curl: number;
  /** after the break: vertical scale of the wave (1 → 0) and foam 0..1 */
  sink: number;
  foam: number;
  /** swell amplitude */
  swell: number;
}

/** ∫ smoothstep(a, b, ·) from −∞ to x */
const iss = (x: number, a: number, b: number) => {
  if (x <= a) return 0;
  if (x >= b) return (b - a) / 2 + (x - b);
  const u = (x - a) / (b - a);
  return (b - a) * (u * u * u - (u * u * u * u) / 2);
};

/** the sea clock: real time, slowed by `slow` between the ramps [in0, in1] … [out0, out1] */
export function seaClock(t: number, t0: number, slow: number, in0: number, in1: number, out0: number, out1: number) {
  return t - t0 - (1 - slow) * (iss(t, in0, in1) - iss(t, out0, out1));
}

// the same numbers on both sides (CPU mirror below)
export const SEA_GLSL_COMMON = /* glsl */ `
uniform vec2 uOrigin;
uniform float uTau, uZc, uH, uWf, uCurl, uSink, uFoam, uSwell, uE;
float swell(vec2 p) {
  float damp = 1. - .7 * smoothstep(-8., 4., p.y), t = uTau;
  return uSwell * damp * (.55 * sin(.21 * p.y + .07 * p.x - 1.6 * t)
                        + .35 * sin(.13 * p.y - .19 * p.x - 1.1 * t + 1.3)
                        + .2 * sin(.37 * p.y + .29 * p.x - 2.3 * t + 4.1));
}
float beach(float z) { return max(z - 2.5, 0.) * .085 - .15; }
float crestZ(float x) { return uZc + 1.5 * sin(.045 * x); }
float crestH(float x) { return uH * (1. + .12 * sin(.07 * x + 1.)); }
float prof(float s) { return s < 0. ? exp(-s * s / 64.) : exp(-s * s / (uWf * uWf)); }
`;

const SEA_GLSL = /* glsl */ `
${SEA_GLSL_COMMON}
vec3 gP0, gP1;
float gK0, gK1, gF0, gF1;
float vn(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  float n = dot(i, vec3(1., 57., 113.));
  vec4 a = fract(sin(vec4(n, n + 1., n + 57., n + 58.)) * 43758.5453);
  vec4 b = fract(sin(vec4(n + 113., n + 114., n + 170., n + 171.)) * 43758.5453);
  vec4 m = mix(a, b, f.z);
  return mix(mix(m.x, m.y, f.x), mix(m.z, m.w, f.x), f.y);
}
vec3 warp(vec3 p, vec4 d, float end) {
  vec2 xz = p.xz + uOrigin;
  float x = xz.x, z = xz.y;
  float land = smoothstep(1.5, 6., z);
  float y = mix(swell(xz), beach(z), land);
  float Hx = crestH(x), s = z - crestZ(x);
  float hw = Hx * prof(s) * (1. - .85 * land);
  float f = hw / max(Hx, 1e-3);
  // the curl: the cap of the crest turns forward and down about a pivot in front of it
  float w = smoothstep(.42, 1., f) * smoothstep(-5.5, -1., s);
  float th = uCurl * (2.1 + .5 * uFoam) * pow(w, 1.25);
  vec2 piv = vec2(crestZ(x) + .35 * uWf, .42 * Hx);
  vec2 q = vec2(z, hw) - piv;
  float c = cos(th), sn = sin(th);
  q = piv + vec2(q.x * c + q.y * sn, -q.x * sn + q.y * c);
  // after the break the whole wave settles, churning
  float yw = q.y * uSink;
  float churn = uFoam * smoothstep(-6., 0., s) * (1. - smoothstep(4., 14., s));
  float nz = vn(vec3(x * .45, z * .45, uTau * 1.7)) - .5, nz2 = vn(vec3(x * 1.3, z * 1.3, uTau * 3.1) + 7.) - .5;
  yw += churn * (nz * 1.6 + nz2 * .6) * (.4 + .6 * uSink);
  float zw = q.x + churn * nz2 * .8;
  vec3 o = vec3(x, y + yw, zw);
  float k = clamp(f * 1.2 + churn * (.6 + nz2), 0., 2.5);
  if (end < .5) { gP0 = o; gK0 = k; gF0 = land; } else { gP1 = o; gK1 = k; gF1 = land; }
  return o;
}
uniform vec3 uLand;
vec4 tint(vec4 c, vec3 p, vec4 d) {
  bool a = all(equal(p, gP0));
  float k = a ? gK0 : gK1, land = a ? gF0 : gF1;
  vec3 col = mix(c.rgb * (1. + 1.3 * k * k), uLand, land);
  float al = c.a * (1. - smoothstep(.62 * uE, uE, length(p.xz - uOrigin)));
  // the rock is solid: no water lines inside it
  vec3 r = (p - vec3(0., -.15, 0.)) / vec3(2.35, 1.5, 2.);
  al *= smoothstep(.9, 1.08, length(r));
  return vec4(col, al);
}`;

export const ALON_SEA_COL = mul(lin('sea'), 0.85);

export class Sea {
  lines: LineBatch;
  constructor(public E = 50, public step = 0.8) {
    const n = Math.round(E / step);
    this.lines = new LineBatch((2 * n + 1) * 2 * n * 2 + 16, SEA_GLSL);
    for (let i = -n; i <= n; i++) {
      const major = i % 5 === 0;
      const col = mul(ALON_SEA_COL, major ? 1.25 : 1), a = major ? 0.75 : 0.5;
      for (let k = -n; k < n; k++) {
        const v = i * step, u0 = k * step, u1 = (k + 1) * step;
        this.lines.seg([v, 0, u0], [v, 0, u1], 1, col, a);
        this.lines.seg([u0, 0, v], [u1, 0, v], 1, col, a);
      }
    }
  }
  /** the grid origin for a camera: snapped to the grid, pushed ahead along its view */
  origin(b: Basis): [number, number] {
    const fx = b.F[0], fz = b.F[2], fl = Math.hypot(fx, fz) || 1;
    const x = b.pos[0] + (fx / fl) * this.E * 0.45, z = b.pos[2] + (fz / fl) * this.E * 0.45;
    const s = this.step * 5;
    return [Math.round(x / s) * s, Math.round(z / s) * s];
  }
  draw(out: RT, b: Basis, S: SeaState, fog: [number, number]) {
    this.lines.draw(out, b, {
      fog,
      nearFade: 0.6,
      uniforms: {
        uOrigin: this.origin(b), uTau: S.tau, uZc: S.zc, uH: S.H, uWf: S.wf, uCurl: S.curl,
        uSink: S.sink, uFoam: S.foam, uSwell: S.swell, uE: this.E, uLand: mul(lin('graphite'), 0.55),
      },
    });
  }
}

// ---- the CPU mirror of the unbroken surface
const ss = smoothstep;
export function seaY(x: number, z: number, S: SeaState): number {
  const damp = 1 - 0.7 * ss(-8, 4, z), t = S.tau;
  const sw = S.swell * damp * (0.55 * Math.sin(0.21 * z + 0.07 * x - 1.6 * t)
    + 0.35 * Math.sin(0.13 * z - 0.19 * x - 1.1 * t + 1.3)
    + 0.2 * Math.sin(0.37 * z + 0.29 * x - 2.3 * t + 4.1));
  const land = ss(1.5, 6, z);
  const y = sw + (Math.max(z - 2.5, 0) * 0.085 - 0.15 - sw) * land;
  const Hx = S.H * (1 + 0.12 * Math.sin(0.07 * x + 1)), s = z - (S.zc + 1.5 * Math.sin(0.045 * x));
  const prof = s < 0 ? Math.exp((-s * s) / 64) : Math.exp((-s * s) / (S.wf * S.wf));
  return y + Hx * prof * (1 - 0.85 * land) * S.sink;
}
/** the surface normal of the mirror, by differences */
export function seaN(x: number, z: number, S: SeaState): V3 {
  const e = 0.25, h = seaY(x, z, S);
  const nx = h - seaY(x + e, z, S), nz = h - seaY(x, z + e, S);
  const l = Math.hypot(nx, e, nz);
  return [nx / l, e / l, nz / l];
}

// ---- spray: points launched along the lip's landing line, ballistic in the sea clock
const SPRAY_GLSL = /* glsl */ `
uniform float uTau, uAmt;
// p = launch point, d = (launch time, vx, vy, vz)
vec3 warp(vec3 p, vec4 d) {
  float a = max(uTau - d.x, 0.);
  return p + d.yzw * a + vec3(0., -4.9 * a * a, 0.);
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float a = uTau - d.x;
  if (a <= 0. || p.y < -.3) return vec4(0.);
  return vec4(c.rgb, c.a * uAmt * smoothstep(0., .06, a) * (1. - smoothstep(1.1, 2.2, a)));
}`;

export class Spray {
  pts: GlowPoints;
  /** launched over [tau0, tau0 + spread] from the line z = zAt(x) (crest-relative), across x ∈ ±w */
  constructor(n: number, tau0: number, spread: number, zAt: (x: number) => number, w = 26, seed = 3) {
    this.pts = new GlowPoints(n, SPRAY_GLSL);
    const white = mul(lin('paper'), 1.1), sea = mul(lin('sea'), 1.6);
    for (let i = 0; i < n; i++) {
      const h = (k: number) => hash(i, seed, k);
      // most spray from near the rock, a thinner curtain all along the lip
      const near = h(1) < 0.3;
      const x = near ? (h(2) - 0.5) * 7 : (h(2) - 0.5) * 2 * w;
      const at = tau0 + spread * h(3) * (near ? 0.6 : 1) + Math.abs(x) * 0.004;
      const z = zAt(x) + (h(4) - 0.5) * 1.5;
      const y = near ? 0.6 + 1.6 * h(5) : 0.2 + h(5);
      const up = near ? 5 + 9 * h(6) : 2.5 + 5 * h(6);
      const a = h(7) * TAU, r = near ? 0.5 + 2 * h(8) : 0.6 + 1.6 * h(8);
      const v: V3 = [Math.cos(a) * r, up, Math.sin(a) * r * 0.6 + (near ? 1.8 : 2.5)];
      const size = h(9) < 0.04 ? -0.045 : -0.009 - 0.018 * h(10);
      this.pts.point(add([x, y, z], [0, 0, 0]), size, h(11) < 0.3 ? sea : white, 0.25 + 0.5 * h(12), [at, v[0], v[1], v[2]]);
    }
  }
  draw(out: RT, b: Basis, tau: number, amt: number, fog: [number, number]) {
    if (amt <= 0) return;
    this.pts.draw(out, b, { fog, nearFade: 3.5, uniforms: { uTau: tau, uAmt: clamp(amt) } });
  }
}
