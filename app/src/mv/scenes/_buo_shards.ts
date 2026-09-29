// Pieces of the earlier worlds for BUO, in lines: a patch of alon's wave mesh, lalamunan's
// C-rings, bulsa's folded note with its handwriting, entablado's arch, noon's photo frame.
// Local unit geometry (x right, y up, z out of the face) placed by a basis each sample. Plus
// the vortex everything rides before it lands, one closed form in TS (shards, letters) and
// GLSL (debris, fireflies), and a ground grid that carries up to four shocks at once.

import type { RT } from '../../engine/gl';
import type { RGB } from '../../engine/palette';
import type { Basis } from '../../engine/3d/camera';
import type { DrawOpts } from '../../engine/3d/geo';
import { LineBatch } from '../../engine/3d/lines';
import { madd, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { hash, lerp, TAU } from '../../engine/util';
import { groundGrid, type GridOpts } from './_labas';

export type Kind = 'wave' | 'throat' | 'note' | 'frame' | 'arch';
/** a segment: ends in local units, alpha, colour slot (0 line, 1 detail, 2 the self) */
type Seg = [V3, V3, number, number];

function wave(): Seg[] {
  const S: Seg[] = [];
  const h = (x: number, y: number) => 0.3 * Math.sin(2.4 * x + 1.1 * y) * (0.6 + 0.4 * Math.cos(1.7 * y)) + 0.12 * Math.sin(4.1 * x - 2.3 * y);
  const edge = (x: number, y: number) => 1 - 0.55 * Math.max(Math.abs(x), Math.abs(y) / 0.8) ** 4;
  const P = (x: number, y: number): V3 => [x, y, h(x, y)];
  for (let j = 0; j <= 8; j++) {
    const y = -0.8 + (1.6 * j) / 8;
    for (let i = 0; i < 12; i++) {
      const x0 = -1 + i / 6, x1 = -1 + (i + 1) / 6;
      S.push([P(x0, y), P(x1, y), (j % 4 ? 0.6 : 1) * edge((x0 + x1) / 2, y), 0]);
    }
  }
  for (let i = 0; i <= 10; i++) {
    const x = -1 + i / 5;
    for (let j = 0; j < 8; j++) {
      const y0 = -0.8 + j / 5, y1 = -0.8 + (j + 1) / 5;
      S.push([P(x, y0), P(x, y1), 0.35 * edge(x, (y0 + y1) / 2), 0]);
    }
  }
  // foam along the crest
  for (let i = 0; i < 14; i++) {
    const x0 = -0.9 + (1.8 * i) / 14, x1 = x0 + 0.08;
    S.push([P(x0, 0.84), P(x1, 0.86), 0.8, 1]);
  }
  return S;
}

function throat(): Seg[] {
  const S: Seg[] = [];
  for (let k = 0; k < 4; k++) {
    const y = -0.75 + 0.5 * k, r = 0.62 + 0.06 * Math.sin(k * 1.7), n = 18;
    // a C of cartilage, open towards +x
    for (let i = 0; i < n; i++) {
      const a0 = 0.3 * Math.PI + (1.4 * Math.PI * i) / n, a1 = 0.3 * Math.PI + (1.4 * Math.PI * (i + 1)) / n;
      S.push([[r * Math.cos(a0), y, r * Math.sin(a0)], [r * Math.cos(a1), y, r * Math.sin(a1)], 1, 0]);
    }
  }
  // the back wall and two wet folds running up it
  for (const [a, al] of [[Math.PI, 0.6], [0.62 * Math.PI, 0.3], [1.38 * Math.PI, 0.3]] as const) {
    for (let j = 0; j < 8; j++) {
      const y0 = -0.95 + (1.9 * j) / 8, y1 = -0.95 + (1.9 * (j + 1)) / 8;
      const w0 = a + 0.12 * Math.sin(y0 * 5), w1 = a + 0.12 * Math.sin(y1 * 5);
      S.push([[0.64 * Math.cos(w0), y0, 0.64 * Math.sin(w0)], [0.64 * Math.cos(w1), y1, 0.64 * Math.sin(w1)], al, 1]);
    }
  }
  return S;
}

function note(): Seg[] {
  const S: Seg[] = [];
  const H = 0.75, W = 0.95, D = 0.4;
  const c0: V3 = [0, -H, 0], c1: V3 = [0, H, 0];
  for (const k of [-1, 1]) {
    const e0: V3 = [k * W, -H, D], e1: V3 = [k * W, H, D];
    S.push([c1, e1, 1, 0], [e1, e0, 1, 0], [e0, c0, 1, 0]);
  }
  S.push([c0, c1, 1, 0]);
  // handwriting across the right wing
  for (let row = 0; row < 6; row++) {
    const v = 0.55 - row * 0.2, end = row === 5 ? 0.5 : 0.9, n = 16;
    for (let i = 0; i < n; i++) {
      const u0 = 0.12 + ((end - 0.12) * i) / n, u1 = 0.12 + ((end - 0.12) * (i + 1)) / n;
      if (hash(row, i, 3) < 0.12) continue;
      const Pn = (u: number): V3 => [u * W, v + 0.045 * Math.sin(u * 70 + row * 2) + 0.02 * Math.sin(u * 23), u * D];
      S.push([Pn(u0), Pn(u1), 0.9, 1]);
    }
  }
  return S;
}

function frame(): Seg[] {
  const S: Seg[] = [];
  const rect = (hx: number, hy: number, a: number, slot: number) => {
    const P: V3[] = [[-hx, -hy, 0], [hx, -hy, 0], [hx, hy, 0], [-hx, hy, 0]];
    for (let i = 0; i < 4; i++) S.push([P[i], P[(i + 1) % 4], a, slot]);
  };
  rect(1, 0.78, 1, 0);
  rect(0.86, 0.64, 0.55, 0);
  // corner mounts
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) S.push([[sx * 0.86, sy * 0.48, 0], [sx * 0.7, sy * 0.64, 0], 0.5, 0]);
  // the photo: a horizon, three together, one a little apart (the self, in gold)
  S.push([[-0.86, -0.28, 0], [0.86, -0.28, 0], 0.45, 1]);
  const fig = (x: number, s: number, slot: number) => {
    const n = 8, hy = -0.28 + 0.62 * s, hr = 0.075 * s;
    for (let i = 0; i < n; i++) {
      const a0 = (TAU * i) / n, a1 = (TAU * (i + 1)) / n;
      S.push([[x + hr * Math.cos(a0), hy + hr * Math.sin(a0), 0], [x + hr * Math.cos(a1), hy + hr * Math.sin(a1), 0], 0.9, slot]);
    }
    const neck = hy - hr, hip = -0.28 + 0.26 * s;
    S.push([[x, neck, 0], [x, hip, 0], 0.9, slot]);
    S.push([[x, hip, 0], [x - 0.07 * s, -0.28, 0], 0.9, slot], [[x, hip, 0], [x + 0.07 * s, -0.28, 0], 0.9, slot]);
    S.push([[x, neck - 0.06 * s, 0], [x - 0.11 * s, hip + 0.02, 0], 0.9, slot], [[x, neck - 0.06 * s, 0], [x + 0.11 * s, hip + 0.02, 0], 0.9, slot]);
  };
  fig(-0.5, 1, 1);
  fig(-0.18, 0.92, 1);
  fig(0.12, 1.02, 1);
  fig(0.6, 0.85, 2);
  return S;
}

function arch(): Seg[] {
  const S: Seg[] = [];
  const line = (a: V3, b: V3, al: number, n = 1, slot = 0) => {
    for (let i = 0; i < n; i++) S.push([madd(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], i / n), madd(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], (i + 1) / n), al, slot]);
  };
  // posts, beam, the valance's scallops
  for (const x of [-1, 1]) {
    line([x, -1, 0], [x, 0.82, 0], 1, 6);
    line([x * 1.1, -1, 0], [x * 1.1, 0.95, 0], 0.6, 6);
  }
  line([-1.1, 0.82, 0], [1.1, 0.82, 0], 1, 8);
  line([-1.1, 0.95, 0], [1.1, 0.95, 0], 0.7, 8);
  for (let i = 0; i < 24; i++) {
    const x0 = -1 + i / 12, x1 = -1 + (i + 1) / 12;
    const y = (x: number) => 0.72 - 0.05 * Math.abs(Math.sin((x + 1) * 3 * Math.PI));
    S.push([[x0, y(x0), -0.01], [x1, y(x1), -0.01], 0.5, 1]);
  }
  // curtains gathered to the sides
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
    const x0 = side * (0.95 - k * 0.075), pull = 0.12 * (1 - k / 5);
    for (let j = 0; j < 10; j++) {
      const y0 = 0.8 - (1.78 * j) / 10, y1 = 0.8 - (1.78 * (j + 1)) / 10;
      const g = (y: number) => x0 + side * pull * Math.sin((Math.PI * (0.8 - y)) / 1.78);
      S.push([[g(y0), y0, -0.02], [g(y1), y1, -0.02], 0.45, 1]);
    }
  }
  // the stage floor's edge, running off either side
  line([-1.6, -1, 0.15], [1.6, -1, 0.15], 0.8, 8);
  line([-1.6, -1, -0.5], [1.6, -1, -0.5], 0.4, 8);
  return S;
}

const GEO: Record<Kind, Seg[]> = { wave: wave(), throat: throat(), note: note(), frame: frame(), arch: arch() };

export interface Placed {
  kind: Kind;
  c: V3;
  R: V3;
  U: V3;
  N: V3;
  /** metres per local unit */
  s: number;
  /** colours for slots 0, 1, 2 */
  col: [RGB, RGB, RGB];
  alpha: number;
  w: number;
}

/** a shard into `L`, in pixel-width lines */
export function addShard(L: LineBatch, p: Placed) {
  const X = (v: V3): V3 => [
    p.c[0] + (p.R[0] * v[0] + p.U[0] * v[1] + p.N[0] * v[2]) * p.s,
    p.c[1] + (p.R[1] * v[0] + p.U[1] * v[1] + p.N[1] * v[2]) * p.s,
    p.c[2] + (p.R[2] * v[0] + p.U[2] * v[1] + p.N[2] * v[2]) * p.s,
  ];
  for (const [a, b, al, k] of GEO[p.kind]) L.seg(X(a), X(b), p.w, p.col[k], p.alpha * al);
}

// ---------------------------------------------------------------- the vortex

export interface Vx {
  /** the vortex's own clock (it stops for the kick gap) */
  tau: number;
  /** 0 = everything in the chest, 1 = out at its radius */
  burst: number;
  /** BUO blowing everything away, 0 → 1+ */
  out: number;
  /** the whole vortex tilting about x at chest height */
  tilt: number;
}

/** chest height the vortex turns about */
export const VX_Y = 1.3;

const fract = (x: number) => x - Math.floor(x);

/** a rider of the vortex: base radius, height, phase, seed (the same as GLSL vortexAt) */
export function vortexAt(r0: number, y0: number, th0: number, seed: number, v: Vx): V3 {
  const th = th0 + v.tau * 2.8 * Math.sqrt(3 / r0);
  const r = r0 * v.burst + 0.25 * v.burst * Math.sin(v.tau * 1.3 + th0 * 3) + v.out * (6 + 14 * fract(seed * 7.3));
  const y = lerp(VX_Y, y0, v.burst) + 0.3 * Math.sin(v.tau * 0.9 + th0 * 5) + v.out * (2 + 5 * fract(seed * 3.1));
  const x = Math.sin(th) * r, z = Math.cos(th) * r, yy = y - VX_Y, c = Math.cos(v.tilt), s = Math.sin(v.tilt);
  return [x, yy * c - z * s + VX_Y, yy * s + z * c];
}

const GLSL_VORTEX = /* glsl */ `
uniform float uTau, uBurst, uOut, uTilt;
vec3 vortexAt(vec4 d) {
  float th = d.z + uTau * 2.8 * sqrt(3. / d.x);
  float r = d.x * uBurst + .25 * uBurst * sin(uTau * 1.3 + d.z * 3.) + uOut * (6. + 14. * fract(d.w * 7.3));
  float y = mix(${VX_Y.toFixed(2)}, d.y, uBurst) + .3 * sin(uTau * .9 + d.z * 5.) + uOut * (2. + 5. * fract(d.w * 3.1));
  vec3 p = vec3(sin(th) * r, y - ${VX_Y.toFixed(2)}, cos(th) * r);
  float c = cos(uTilt), s = sin(uTilt);
  return vec3(p.x, p.y * c - p.z * s + ${VX_Y.toFixed(2)}, p.y * s + p.z * c);
}`;

const vxUniforms = (v: Vx) => ({ uTau: v.tau, uBurst: v.burst, uOut: v.out, uTilt: v.tilt });

const DEBRIS = /* glsl */ `
${GLSL_VORTEX}
uniform float uI, uGold;
uniform vec3 uGoldCol;
vec3 warp(vec3 p, vec4 d, float end) {
  float a = uTau * (2. + 4. * fract(d.w * 13.7)), b = uTau * (1.3 + 3. * fract(d.w * 5.9));
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  p.yz = mat2(cos(b), -sin(b), sin(b), cos(b)) * p.yz;
  return vortexAt(d) + p * (1. + uOut * 2.);
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  return vec4(mix(c.rgb * uI, uGoldCol, uGold), c.a * (1. - smoothstep(.35, 1., uOut)));
}`;

const FLIES = /* glsl */ `
${GLSL_VORTEX}
uniform float uI, uNowF;
vec3 warp(vec3 p, vec4 d) {
  return vortexAt(vec4(p, d.x)) + vec3(0., sin(uTau * 2. + d.z * 9.) * .15, 0.);
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  return vec4(c.rgb * uI, c.a * (.55 + .45 * sin(uNowF * d.y + d.z * 40.)) * (1. - smoothstep(.5, 1.3, uOut)));
}`;

let debrisL: LineBatch | null = null, fliesP: GlowPoints | null = null;

export interface SwirlDraw extends DrawOpts {
  vx: Vx;
  now: number;
  /** debris brightness, how far it has turned gold (and to what) */
  debrisI: number;
  gold: number;
  goldCol: RGB;
  /** firefly brightness (the self's light) */
  fliesI: number;
}

/** splinters of every world and LOOB's fireflies, riding the vortex (built once, moved on the GPU) */
export class Swirl {
  constructor(cols: RGB[], nDebris = 520, nFlies = 600) {
    if (!debrisL) {
      debrisL = new LineBatch(nDebris, DEBRIS);
      for (let i = 0; i < nDebris; i++) {
        const r0 = 1.9 + 4.6 * hash(i, 1, 1) ** 0.8, y0 = 0.15 + 4.8 * hash(i, 1, 2), th0 = TAU * hash(i, 1, 3), seed = hash(i, 1, 4);
        const l = 0.05 + 0.3 * hash(i, 1, 5) ** 2, u = TAU * hash(i, 1, 6), v = Math.acos(2 * hash(i, 1, 7) - 1);
        const d: V3 = [Math.sin(v) * Math.cos(u) * l * 0.5, Math.cos(v) * l * 0.5, Math.sin(v) * Math.sin(u) * l * 0.5];
        const col = cols[Math.floor(hash(i, 1, 8) * cols.length)];
        debrisL.seg([-d[0], -d[1], -d[2]], d, 1, col, 0.35 + 0.5 * hash(i, 1, 9), [r0, y0, th0, seed]);
      }
    }
    if (!fliesP) {
      fliesP = new GlowPoints(nFlies, FLIES);
      for (let i = 0; i < nFlies; i++) {
        const r0 = 1.2 + 6 * hash(i, 2, 1) ** 0.7, y0 = 0.05 + 5.5 * hash(i, 2, 2) ** 1.3, th0 = TAU * hash(i, 2, 3);
        const big = hash(i, 2, 4) < 0.04;
        fliesP.point([r0, y0, th0], big ? -0.022 : -0.008 - 0.007 * hash(i, 2, 5), [1, 0.62, 0.22], big ? 0.6 : 0.4,
          [hash(i, 2, 6), 3 + 6 * hash(i, 2, 7), hash(i, 2, 8), 0]);
      }
    }
  }

  draw(out: RT, b: Basis, o: SwirlDraw) {
    const vu = vxUniforms(o.vx);
    debrisL!.draw(out, b, { ...o, uniforms: { ...vu, uI: o.debrisI, uGold: o.gold, uGoldCol: o.goldCol } });
    fliesP!.draw(out, b, { ...o, uniforms: { ...vu, uI: o.fliesI, uNowF: o.now } });
  }
}

// ---------------------------------------------------------------- the ground

/** shocks the grid carries at once */
export const SHOCKS = 4;

const GRID = /* glsl */ `
uniform float uNow, uLight, uGold;
uniform float uShk[${SHOCKS * 6}]; // (t0, max radius, speed, amp, centre x, z) per shock
uniform vec3 uGlowCol;
// a ring leaving the origin at speed v, easing to a stop at radius R
float front(float age, float R, float v) { return R * (1. - exp(-age * v / R)); }
vec3 warp(vec3 p, vec4 d, float end) {
  float k = 0.;
  vec2 push = vec2(0.);
  for (int i = 0; i < ${SHOCKS}; i++) {
    int j = i * 6;
    float age = uNow - uShk[j], a = uShk[j + 3];
    if (age < 0. || a <= 0.) continue;
    vec2 q = p.xz - vec2(uShk[j + 4], uShk[j + 5]);
    float r = length(q), x = r - front(age, uShk[j + 1], uShk[j + 2]), w = .8 + age * .5;
    float h = exp(-x * x / (w * w)) * a * exp(-age * 1.1);
    k += h;
    push += q / max(r, 1e-3) * h * .35;
  }
  p.y += k;
  p.xz += push;
  return p;
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float r = length(p.xz), up = clamp(p.y * 1.5, 0., 2.);
  vec3 col = c.rgb * (1. + up * 2.);
  // behind the warm front the floor takes the self's light
  if (uGold > 0.) {
    float g = smoothstep(uGold, uGold - 5., r);
    col = mix(col, uGlowCol * uLight * .22, g * .8) + uGlowCol * uLight * .7 * exp(-pow((r - uGold) / 1.4, 2.));
  }
  return vec4(col, c.a * (1. + up));
}`;

export interface Shock {
  t: number;
  /** where it leaves from (x, z; default the origin) */
  c?: [number, number];
  /** radius it eases to, m/s it leaves at, lift in metres */
  R: number;
  v: number;
  amp: number;
}

/** the front radius of a shock at song time t (as the grid computes it) */
export const shockFront = (s: Shock, t: number) => (t < s.t ? 0 : s.R * (1 - Math.exp((-(t - s.t) * s.v) / s.R)));

let gridL: LineBatch | null = null;

export class Grid {
  constructor(o: GridOpts) {
    if (!gridL) {
      gridL = new LineBatch(20000, GRID);
      groundGrid(gridL, o);
    }
  }
  /** the grid with the (up to SHOCKS) most recent shocks; gold = radius of the warm front (0 = none) */
  draw(out: RT, b: Basis, now: number, shocks: Shock[], light: number, gold: number, glow: RGB, d: DrawOpts = {}) {
    const S = new Array<number>(SHOCKS * 6).fill(0);
    shocks.filter((s) => s.t <= now).slice(-SHOCKS).forEach((s, i) => S.splice(i * 6, 6, s.t, s.R, s.v, s.amp, ...(s.c ?? [0, 0])));
    gridL!.draw(out, b, { ...d, uniforms: { uNow: now, uShk: S, uLight: light, uGold: gold, uGlowCol: glow } });
  }
}
