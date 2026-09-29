// Shared by the three chorus plates, DAMI, SULOK and NOON, in every version: the shader
// programs (built once per module, reused by all eight entries), a volumetric spotlight,
// the crowd of thousands with the spot, the drain and the warm leak on the GPU, flattened
// figures for photographs, and the in-scene smash-cut clock.

import { FPS } from '../../engine/config';
import { sans, serif } from '../../engine/fonts';
import { Pass, type RT } from '../../engine/gl';
import { lin, type RGB } from '../../engine/palette';
import { frameIdx, hash } from '../../engine/util';
import { cam, camUniforms, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, madd, mul, norm, sub, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { GLSL_SDF } from '../../engine/3d/sdf.glsl';
import { Words } from '../../engine/3d/words';
import { Fill } from './_fx';
import { addFigure, figure, FIGURE_GLSL, groundGrid, HEAD_R, INK, LABAS_FOG, POSE, scatter, Sky, type Figure, type Member } from './_labas';
import { Flies, Loob } from './_loob';
import { Self } from './_self';

export const toFrame = (t: number) => Math.round(t * FPS) / FPS;

/** index of the shot a smash-cut list is on at t: cuts are song times, snapped to frames here */
export function smashIdx(t: number, cuts: number[]): number {
  const f = frameIdx(t);
  let i = -1;
  for (const c of cuts) if (f >= Math.round(c * FPS)) i++;
  return Math.max(i, 0);
}

// ---------------------------------------------------------------- look and place

export const PAPER = mul(lin('paper'), 1.25);
/** the self's lines: a shade brighter than everyone else's (brighter than INK.bright) */
export const SELF_INK = mul(lin('paper'), 0.75);
/** hero words, and the self's own quiet ones */
export const HERO = sans(100, 800, 'extra-condensed', 4);
export const QUIET = serif(100, 360, true, 1);

/** the rim of the crowd where the self stands in DAMI and whose corner SULOK finds */
export const RIM_A = 2.2, RIM_R = 89.5;
export const OUTW: V3 = [Math.sin(RIM_A), 0, Math.cos(RIM_A)];
export const TANG: V3 = [Math.cos(RIM_A), 0, -Math.sin(RIM_A)];
export const RIM: V3 = mul(OUTW, RIM_R);

/** horizontal right axis of something at p turned to face the camera */
export const faceR = (b: Basis, p: V3): V3 => {
  const d = sub(b.pos, p);
  return norm([d[2], 0, -d[0]]);
};

/** a local frame on the ground: origin `a`, forward F at yaw `f`, X to its left (seen from in front, the viewer's right is −X) */
export interface Local { a: V3; F: V3; X: V3; yaw: number }
export const local = (a: V3, yaw: number): Local => ({ a, yaw, F: [Math.sin(yaw), 0, Math.cos(yaw)], X: [-Math.cos(yaw), 0, Math.sin(yaw)] });
export const at = (L: Local, p: V3): V3 => add(madd(madd(L.a, L.X, p[0]), L.F, p[2]), [0, p[1], 0]);
export const camAt = (L: Local, pos: V3, tgt: V3, fov = 40, roll = 0): Cam => cam(at(L, pos), at(L, tgt), fov, roll);

// ---------------------------------------------------------------- shared programs

let sky: Sky | null = null, loob: Loob | null = null, self: Self | null = null, fill: Fill | null = null;
let words: Words | null = null, spot: Spot | null = null;
export const kit = {
  get sky() { return (sky ??= new Sky()); },
  get loob() { return (loob ??= new Loob()); },
  get self() { return (self ??= new Self()); },
  get fill() { return (fill ??= new Fill()); },
  get words() { return (words ??= new Words()); },
  get spot() { return (spot ??= new Spot()); },
};

// ---------------------------------------------------------------- spotlight

/** a cone of light from `apex` onto the ground round `tgt`, radius `r` there */
export interface SpotLight {
  apex: V3;
  tgt: V3;
  r: number;
  /** linear colour × intensity */
  col: RGB;
}

export function spotUniforms(s: SpotLight | null) {
  if (!s) return { uSpotA: [0, 1e4, 0], uSpotD: [0, -1, 0], uSpotTan: 1e-4, uSpotCol: [0, 0, 0] };
  const ax = sub(s.tgt, s.apex), h = Math.hypot(ax[0], ax[1], ax[2]);
  return { uSpotA: s.apex, uSpotD: norm(ax), uSpotTan: s.r / h, uSpotCol: s.col };
}

const SPOT = /* glsl */ `
${GLSL_SDF}
uniform vec3 uSpotA, uSpotD, uSpotCol;
uniform float uSpotTan, uGround, uTime, uBeam, uPool;
void main() {
  vec3 ro = uCamPos, rd = camRay();
  float tg = (ro.y > uGround && rd.y < 0.) ? (uGround - ro.y) / rd.y : 1e4;
  float tmax = min(tg, 700.);
  vec3 col = vec3(0.);
  // the ray's interval inside the (convex) forward cone: split at the quadric's roots,
  // keep the pieces whose midpoints are inside
  float c2 = 1. / (1. + uSpotTan * uSpotTan);
  vec3 co = ro - uSpotA;
  float rdD = dot(rd, uSpotD), coD = dot(co, uSpotD);
  float a = rdD * rdD - c2, b = rdD * coD - c2 * dot(rd, co), c = coD * coD - c2 * dot(co, co);
  float disc = b * b - a * c;
  float r1 = 0., r2 = 0.;
  if (disc > 0. && abs(a) > 1e-7) { float s = sqrt(disc); r1 = (-b - s) / a; r2 = (-b + s) / a; }
  float e0 = 0., e1 = clamp(min(r1, r2), 0., tmax), e2 = clamp(max(r1, r2), 0., tmax), e3 = tmax;
  float ta = 1e9, tb = -1.;
  for (int i = 0; i < 3; i++) {
    float lo = i == 0 ? e0 : i == 1 ? e1 : e2, hi = i == 0 ? e1 : i == 1 ? e2 : e3;
    if (hi <= lo) continue;
    vec3 q = ro + rd * (.5 * (lo + hi)) - uSpotA;
    float h = dot(q, uSpotD);
    if (h > 0. && h * h >= c2 * dot(q, q)) { ta = min(ta, lo); tb = max(tb, hi); }
  }
  if (tb > ta) {
    float jit = hash12(gl_FragCoord.xy), dt = (tb - ta) / 24., acc = 0.;
    for (int i = 0; i < 24; i++) {
      vec3 p = ro + rd * (ta + (float(i) + jit) * dt), q = p - uSpotA;
      float h = dot(q, uSpotD), r = length(q - uSpotD * h) / max(h * uSpotTan, 1e-3);
      float dust = .45 + .55 * vnoise3(p * vec3(.3, .12, .3) + vec3(0., -uTime * .5, uTime * .15));
      acc += smoothstep(1., .5, r) * dust / (1. + h * h * .0006);
    }
    col += uSpotCol * acc * dt * uBeam;
  }
  // the pool it throws on the ground, with a crisp rim
  if (tg < 1e4) {
    vec3 q = ro + rd * tg - uSpotA;
    float h = dot(q, uSpotD);
    if (h > 0.) {
      float r = length(q - uSpotD * h) / (h * uSpotTan);
      col += uSpotCol * uPool * (smoothstep(1.02, .82, r) * .8 + exp(-pow((r - .98) * 22., 2.)) * .6);
    }
  }
  fragColor = vec4(col, 0.);
}`;

export class Spot {
  private pass = new Pass(SPOT);
  /** additive: the beam's dusty in-scatter and its pool on the ground */
  draw(out: RT, b: Basis, t: number, s: SpotLight, o: { beam?: number; pool?: number; ground?: number } = {}) {
    this.pass.draw(out, {
      ...camUniforms(b), ...spotUniforms(s),
      uTime: t, uBeam: o.beam ?? 0.035, uPool: o.pool ?? 0.35, uGround: o.ground ?? 0,
    }, 'add');
  }
}

// ---------------------------------------------------------------- the crowd

/**
 * Line tint shared by the crowd and the props: the spotlight brightens what stands in it,
 * `uDrain` (0..1) fades figures out in hashed order (the noise draining away), and the
 * warm leak (v3) gilds lines near the self and in a drifting firefly-density field.
 */
export const TINT_GLSL = /* glsl */ `
uniform vec3 uSpotA, uSpotD, uSpotCol, uLeakCol;
uniform float uSpotTan, uDrain, uLeakT;
uniform vec4 uLeak; // centre, strength
float lhash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float lnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(lhash(i), lhash(i + vec3(1, 0, 0)), f.x), mix(lhash(i + vec3(0, 1, 0)), lhash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lhash(i + vec3(0, 0, 1)), lhash(i + vec3(1, 0, 1)), f.x), mix(lhash(i + vec3(0, 1, 1)), lhash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  // ids > 0 drain; 0 (the ground) and < 0 (outlines) stay
  float id = fract(sin(d.x * 91.3458 + 3.1) * 47453.5453);
  if (d.x > 0.) c.a *= smoothstep(uDrain, uDrain + .06, id);
  vec3 q = p - uSpotA;
  float h = dot(q, uSpotD);
  if (h > 0.) c.rgb += uSpotCol * smoothstep(1., .78, length(q - uSpotD * h) / (h * uSpotTan));
  if (uLeak.w > 0.) {
    vec3 L = p - uLeak.xyz;
    float near = exp(-dot(L, L) * .004), field = smoothstep(.55, .9, lnoise(p * .18 + vec3(0., -uLeakT * .3, uLeakT * .1)));
    c.rgb += uLeakCol * uLeak.w * (near * .9 + field * .5 * near + field * .15);
  }
  return c;
}`;

export interface TintU {
  spot?: SpotLight | null;
  drain?: number;
  leak?: { at: V3; k: number; t: number; col?: RGB };
}
export const tintUniforms = (o: TintU) => ({
  ...spotUniforms(o.spot ?? null),
  uDrain: o.drain ?? -0.1,
  uLeak: o.leak ? [...o.leak.at, o.leak.k] : [0, 0, 0, 0],
  uLeakT: o.leak?.t ?? 0,
  uLeakCol: o.leak?.col ?? lin('ember'),
});

/** the ground: a 2 m grid to the horizon, never drained */
let grid: LineBatch | null = null;
export function chorusGrid(): LineBatch {
  if (grid) return grid;
  grid = new LineBatch(16000, TINT_GLSL);
  groundGrid(grid, { extent: 170, step: 2, seg: 30 });
  return grid;
}

/** the crowd of thousands round the clearing at the origin, all facing it */
export const CROWD_R: [number, number] = [8, 88];
let members: Member[] | null = null, crowd: LineBatch | null = null;
export const crowdMembers = () =>
  (members ??= scatter(6500, {
    r0: CROWD_R[0], r1: CROWD_R[1], seed: 41,
    poses: [POSE.stand, POSE.stand, POSE.stand, POSE.talk, POSE.laugh, POSE.cheer, POSE.shy],
  }));
export function bigCrowd(): LineBatch {
  if (crowd) return crowd;
  const ms = crowdMembers();
  crowd = new LineBatch(ms.length * 29, FIGURE_GLSL + TINT_GLSL);
  const figs = new Map<object, Figure>();
  ms.forEach((m, i) => {
    const p = m.pose ?? POSE.stand;
    if (!figs.has(p)) figs.set(p, figure(p));
    addFigure(crowd!, figs.get(p)!, m, i + 1, 1, INK.line, 0.95);
  });
  return crowd;
}

/** the crowd's GPU life: beat sway / bob plus the tint */
export function drawCrowd(L: LineBatch, out: RT, b: Basis, beat: number, o: TintU & { sway?: number; bob?: number; fog?: [number, number]; nearFade?: number }) {
  L.draw(out, b, {
    fog: o.fog ?? LABAS_FOG, nearFade: o.nearFade,
    uniforms: { uBeat: beat, uSway: o.sway ?? 0.04, uBob: o.bob ?? 0.02, uGroundY: 0, ...tintUniforms(o) },
  });
}

// ---------------------------------------------------------------- the crowd as fireflies

/**
 * LOOB's twin of the crowd: one firefly where each person stands, at chest height over the
 * sea, drifting on a small helix. `swirl` (radians, a function of t) turns the whole field
 * round `centre`, the inner ones faster; `lift` raises them all.
 */
const CFLY = /* glsl */ `
uniform float uTime, uSwirl, uLift;
uniform vec3 uC;
vec3 warp(vec3 p, vec4 d) {
  float w = uTime * (.5 + d.y) + d.x * 6.2831853;
  p += vec3(cos(w) * d.z, sin(uTime * .9 * d.y + d.x * 11.) * .3 + uLift * (.5 + d.y), sin(w) * d.z);
  vec2 q = p.xz - uC.xz;
  float a = uSwirl / (1. + length(q) * .05), c = cos(a), s = sin(a);
  p.xz = uC.xz + mat2(c, s, -s, c) * q;
  return p;
}
vec4 tint(vec4 c, vec3 p, vec4 d) { return vec4(c.rgb, c.a * (.6 + .4 * sin(uTime * d.w + d.x * 40.))); }`;
let cflies: GlowPoints | null = null;
export function crowdFlies(): GlowPoints {
  if (cflies) return cflies;
  cflies = new GlowPoints(crowdMembers().length, CFLY);
  const gold = lin('glow'), ember = lin('ember');
  crowdMembers().forEach((m, i) => {
    const warm = hash(i, 5, 9) < 0.2;
    cflies!.point([m.pos[0], 1.25 * (m.scale ?? 1), m.pos[2]], -0.045 - 0.03 * hash(i, 5, 7), mul(warm ? ember : gold, 2.2), 0.6 + 0.6 * hash(i, 5, 4),
      [hash(i, 5, 5), 0.3 + hash(i, 5, 6), 0.1 + 0.3 * hash(i, 5, 10), 1.5 + 4 * hash(i, 5, 11)]);
  });
  return cflies;
}
export function drawCrowdFlies(out: RT, b: Basis, t: number, o: { depth?: RT; swirl?: number; centre?: V3; lift?: number; fog?: [number, number] } = {}) {
  crowdFlies().draw(out, b, {
    depth: o.depth, fog: o.fog ?? [20, 0.012], nearFade: 0.4,
    uniforms: { uTime: t, uSwirl: o.swirl ?? 0, uLift: o.lift ?? 0, uC: o.centre ?? [0, 0, 0] },
  });
}

// ---------------------------------------------------------------- fireflies leaving the chest

/** a closed-form stream of fireflies breathed out of a point: `k` 0..1 of them alive */
const LEAK = /* glsl */ `
uniform float uTime, uK, uLife, uSpread;
uniform vec3 uSrc;
float ageOf(vec4 d) { return fract(uTime / uLife * (.6 + .4 * d.y) + d.x); }
vec3 warp(vec3 p, vec4 d) {
  float age = ageOf(d), a = d.z * 6.2831853 + age * 1.6, r = age * uSpread * (.35 + .65 * d.y);
  return uSrc + vec3(cos(a) * r, age * uSpread * d.w * .5 + sin(age * 9. + d.x * 20.) * .12, sin(a) * r) + p * age * uSpread * .3;
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float age = ageOf(d), tw = .6 + .4 * sin(uTime * (3. + d.w * 5.) + d.x * 40.);
  return vec4(c.rgb, c.a * tw * smoothstep(0., .06, age) * (1. - smoothstep(.55, 1., age)) * step(fract(d.x * 7.31), uK));
}`;
export class Leak {
  private pts: GlowPoints;
  /** `size` scales every firefly (smaller for shots close to the source) */
  constructor(n = 700, seed = 3, size = 1) {
    this.pts = new GlowPoints(n, LEAK);
    const gold = lin('glow'), ember = lin('ember');
    for (let i = 0; i < n; i++)
      this.pts.point([hash(i, seed, 1) - 0.5, hash(i, seed, 2) - 0.5, hash(i, seed, 3) - 0.5], (-0.016 - 0.02 * hash(i, seed, 7)) * size,
        mul(hash(i, seed, 9) < 0.25 ? ember : gold, 2.4), 0.7 + 0.6 * hash(i, seed, 4),
        [hash(i, seed, 5), hash(i, seed, 6), hash(i, seed, 8), 0.4 + hash(i, seed, 10)]);
  }
  /** `src` the chest; `spread` metres a firefly travels over its `life` seconds */
  draw(out: RT, b: Basis, t: number, o: { src: V3; k: number; life?: number; spread?: number; depth?: RT; fog?: [number, number]; nearFade?: number }) {
    if (o.k <= 0) return;
    this.pts.draw(out, b, {
      depth: o.depth, fog: o.fog, nearFade: o.nearFade ?? 1.2,
      uniforms: { uTime: t, uK: o.k, uLife: o.life ?? 6, uSpread: o.spread ?? 8, uSrc: o.src },
    });
  }
}

// ---------------------------------------------------------------- flat figures (photographs)

/** a posed figure pressed flat into the plane (u, v) at c: for sketches inside photos */
export function flatFigure(L: LineBatch, fig: Figure, c: V3, u: V3, v: V3, s: number, w: number, col: RGB, a: number, data?: ArrayLike<number>) {
  const P = (p: V3): V3 => madd(madd(c, u, (p[0] + p[2] * 0.35) * s), v, p[1] * s);
  for (const [p, q] of fig.segs) L.seg(P(p), P(q), w, col, a, data);
  L.ring(P(fig.head), HEAD_R * s, u, v, w, col, a, 12, data);
}

/** unit axes of a plane facing direction n (up stays up) */
export function planeAxes(n: V3): { u: V3; v: V3 } {
  const u = norm(cross([0, 1, 0], n));
  return { u, v: cross(n, u) };
}

export { Flies };
