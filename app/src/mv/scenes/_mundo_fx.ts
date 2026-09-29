// Private helpers for MUNDO and HAKBANG: a swarm of fireflies that flies from a source
// into a target shape (a word sampled from its glyphs, or a constellation of the self),
// the LOOB island layout mirrored in JS (so a camera path can be kept out of the rock),
// and a crossfade pass for handing a world over to another one.

import { applyFont, layout, type FontSpec } from '../../engine/fonts';
import { Pass, type RT } from '../../engine/gl';
import { lin, type RGB } from '../../engine/palette';
import type { Basis } from '../../engine/3d/camera';
import type { DrawOpts } from '../../engine/3d/geo';
import { dist, len, mul, sub, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { clamp, ease, hash, lerp } from '../../engine/util';
import type { Figure } from './_labas';

// ---------------------------------------------------------------- the swarm

const SWARM = /* glsl */ `
uniform vec3 uO, uR, uU, uN, uSrc, uSpread;
uniform float uTime, uK[8], uArc, uJit, uFlare;
// aP = target in the shape's frame; d = (source offset in -1..1, group + phase)
float arrive(vec4 d) {
  int g = int(floor(d.w));
  float ph = fract(d.w);
  float e = clamp(uK[g] * 1.6 - ph * .6, 0., 1.);
  return e * e * (3. - 2. * e);
}
vec3 warp(vec3 p, vec4 d) {
  float e = arrive(d), ph = fract(d.w);
  vec3 tgt = uO + uR * p.x + uU * p.y + uN * p.z;
  vec3 src = uSrc + uSpread * d.xyz;
  // one bezier arc per fly: out of the source, up and round, into its place
  vec3 ctl = mix(src, tgt, .5) + uN * d.x * uArc + uU * (.3 + .7 * ph) * uArc;
  vec3 q = mix(mix(src, ctl, e), mix(ctl, tgt, e), e);
  // alive: a wander that settles to a shimmer once the fly has landed
  float w = uTime * (1.3 + ph) + ph * 40.;
  q += vec3(sin(w), sin(w * 1.31 + 2.), cos(w * .87)) * mix(1., .12, e) * uJit;
  return q;
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float e = arrive(d), ph = fract(d.w);
  float tw = .75 + .25 * sin(uTime * (3. + 4. * ph) + ph * 60.);
  return vec4(c.rgb * (1. + uFlare * e), c.a * smoothstep(0., .08, e) * tw);
}`;

export interface SwarmFrame {
  /** shape origin and axes (world units per shape unit) */
  o: V3;
  r: V3;
  u: V3;
  n: V3;
}

export interface SwarmDraw extends DrawOpts {
  t: number;
  frame: SwarmFrame;
  /** progress 0..1 of each group (≤ 8) */
  k: number[];
  /** where the flies come from, and how far round it they start */
  src: V3;
  spread: V3;
  /** height of each fly's arc (shape units, so it scales with the frame), wander (world units) */
  arc?: number;
  jit?: number;
  /** extra brightness of the landed shape */
  flare?: number;
}

/** glow points that fly from a source into target points; group g lands with k[g] */
export class Swarm {
  pts: GlowPoints;
  n = 0;
  constructor(cap: number) {
    this.pts = new GlowPoints(cap, SWARM);
  }
  add(target: V3, group: number, size: number, col: RGB, a: number, seed: number, i: number) {
    const ph = hash(i, seed, 4) * 0.999;
    this.pts.point(target, size, col, a, [hash(i, seed, 1) * 2 - 1, hash(i, seed, 2) * 2 - 1, hash(i, seed, 3) * 2 - 1, group + ph]);
    this.n++;
  }
  draw(out: RT, b: Basis, o: SwarmDraw) {
    const { t, frame, k, src, spread, arc, jit, flare, ...d } = o;
    const K = [...k, 0, 0, 0, 0, 0, 0, 0, 0].slice(0, 8);
    this.pts.draw(out, b, {
      nearFade: 0.3,
      ...d,
      uniforms: {
        uTime: t, uO: frame.o, uR: frame.r, uU: frame.u, uN: frame.n, uK: K,
        uSrc: src, uSpread: spread, uArc: arc ?? 0, uJit: jit ?? 0, uFlare: flare ?? 0,
        ...(d.uniforms ?? {}),
      },
    });
  }
}

/**
 * Sample `n` points inside a word's glyphs, in em units of the Words kit convention
 * (x from the aligned pen, y up from the baseline-to-cap middle), grouped by letter
 * (non-blank letters numbered from 0). Deterministic: jittered candidates by hash.
 */
export function wordPoints(text: string, f: FontSpec, n: number, seed = 1, align = 0.5) {
  const S = 256, rf = { ...f, size: S, tracking: ((f.tracking ?? 0) * S) / f.size };
  const L = layout(text, rf);
  const pad = 16, W = Math.ceil(L.w) + 2 * pad, H = Math.ceil(S * 1.2) + 2 * pad, base = pad + S * 0.95;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  applyFont(c, rf);
  c.fillStyle = '#fff';
  c.textBaseline = 'alphabetic';
  c.fillText(text, pad, base);
  const img = c.getImageData(0, 0, W, H).data;
  // letter index for each char (blanks don't count)
  const letter: number[] = [];
  let li = 0;
  for (const ch of text) letter.push(ch.trim() ? li++ : -1);
  const out: { p: V3; g: number }[] = [];
  const x0 = align * L.w;
  for (let i = 0; out.length < n && i < n * 60; i++) {
    const x = hash(i, seed, 11) * W, y = hash(i, seed, 12) * H;
    if (img[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] < 140) continue;
    const px = x - pad;
    let ci = 0;
    while (ci + 1 < L.xs.length && px >= L.xs[ci + 1]) ci++;
    let g = letter[ci];
    if (g < 0) g = Math.max(0, letter.slice(0, ci).filter((v) => v >= 0).length - 1);
    out.push({ p: [(px - x0) / S, (base - y) / S - 0.36, 0], g });
  }
  return { pts: out, letters: li, w: L.w / S };
}

/**
 * The self as a constellation: bright stars at the joints, fainter ones strung along
 * the limbs, a ring for the head. Points are in the figure's own frame (metres, feet at
 * 0, facing +z); `group` of a point is the body part (0 legs, 1 torso, 2 arms, 3 head).
 */
export function figureStars(fig: Figure, perM = 14, seed = 3) {
  const stars: { p: V3; g: number; big: boolean }[] = [];
  const joints = new Map<string, V3>();
  const key = (p: V3) => p.map((v) => v.toFixed(3)).join(',');
  fig.segs.forEach(([a, b], si) => {
    // the order of figure(): 5 torso segments, 4 arm, 6 leg
    const g = si < 5 ? 1 : si < 9 ? 2 : 0;
    joints.set(key(a), a);
    joints.set(key(b), b);
    const L = dist(a, b), m = Math.max(1, Math.round(L * perM));
    for (let k = 1; k < m; k++) {
      const u = (k + (hash(si, k, seed) - 0.5) * 0.6) / m;
      stars.push({ p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)], g, big: false });
    }
  });
  for (const p of joints.values()) stars.push({ p, g: p[1] > 1.2 ? 1 : 0, big: true });
  const hr = 0.115, nH = 18;
  for (let k = 0; k < nH; k++) {
    const a = (k / nH) * Math.PI * 2;
    stars.push({ p: [fig.head[0] + Math.cos(a) * hr, fig.head[1] + Math.sin(a) * hr, fig.head[2]], g: 3, big: k % 6 === 0 });
  }
  return stars;
}

// ---------------------------------------------------------------- islands, in JS

// GLSL_COMMON's hashes in float32, so the islands the shader places can be found here
const f = Math.fround;
const fr = (x: number) => f(x - Math.floor(x));
function h3(x: number, y: number, z: number, kx: number, ky: number, kz: number): [number, number, number] {
  let a = fr(f(x * f(kx))), b = fr(f(y * f(ky))), c = fr(f(z * f(kz)));
  const d = f(f(f(a * f(b + f(33.33))) + f(b * f(c + f(33.33)))) + f(c * f(a + f(33.33))));
  a = f(a + d); b = f(b + d); c = f(c + d);
  return [a, b, c];
}
function hash12(x: number, y: number) {
  const [a, b, c] = h3(x, y, x, 0.1031, 0.1031, 0.1031);
  return fr(f(f(a + b) * c));
}
function hash22(x: number, y: number): [number, number] {
  const [a, b, c] = h3(x, y, x, 0.1031, 0.103, 0.0973);
  return [fr(f(f(a + b) * c)), fr(f(f(a + c) * b))];
}

const CELL = 36;
export interface Isle {
  c: V3;
  r: number;
  /** the island's hash against the density threshold (near 0 = unsure) */
  margin: number;
}

/** the islands (as the LOOB shader places them) in the cells within `R` m of p */
export function islesNear(p: V3, isles: number, isleY: number, R = 60): Isle[] {
  const out: Isle[] = [];
  const n = Math.ceil(R / CELL) + 1;
  const ix = Math.floor(p[0] / CELL + 0.5), iz = Math.floor(p[2] / CELL + 0.5);
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const x = ix + i, z = iz + j;
      const h = hash12(f(f(x * 1.7) + 3.1), f(f(z * 1.7) + 3.1));
      if (h >= isles + 0.01) continue;
      const r = lerp(2.5, 7.5, Math.pow(hash12(f(x + 11.2), f(z + 11.2)), 1.5));
      const o = hash22(f(x + 5.3), f(z + 5.3));
      const y = isleY + lerp(-4, 8, hash12(f(x + 23.9), f(z + 23.9)));
      out.push({ c: [x * CELL + (o[0] - 0.5) * (CELL - 2.4 * r), y, z * CELL + (o[1] - 0.5) * (CELL - 2.4 * r)], r, margin: isles - h });
    }
  return out;
}

/** metres of air between p and the nearest island's (generous) bounding volume; < 0 = inside */
export function isleClearance(p: V3, isles: number, isleY: number): number {
  let m = 1e9;
  for (const s of islesNear(p, isles, isleY)) {
    const dh = Math.hypot(p[0] - s.c[0], p[2] - s.c[2]) - 1.4 * s.r;
    const dv = Math.max(s.c[1] - 2.1 * s.r - p[1], p[1] - (s.c[1] + 0.5 * s.r));
    m = Math.min(m, Math.max(dh, dv));
  }
  return m;
}

// ---------------------------------------------------------------- crossfade

const MIX = /* glsl */ `
uniform sampler2D uSrc; uniform float uK;
void main() { fragColor = vec4(texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).rgb * uK, uK); }`;

/** paint `src` over `out` with opacity k (premultiplied 'over') */
export class Blend {
  private pass = new Pass(MIX);
  draw(out: RT, src: RT, k: number) {
    if (k > 0) this.pass.draw(out, { uSrc: src, uK: clamp(k) }, 'over');
  }
}

// ---------------------------------------------------------------- small things

export const GOLD_HOT = mul(lin('glow'), 2.4);
export const toFrame = (t: number) => Math.round(t * 60) / 60;
/** 0..1 through [a, b] with an ease, clamped */
export const seg = (t: number, a: number, b: number, e = ease.inOutCubic) => e(clamp((t - a) / (b - a)));
export const lenSub = (a: V3, b: V3) => len(sub(a, b));
