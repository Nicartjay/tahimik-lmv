// GITNA's world, which WAKAS inherits whole so the cut between them is one continuous
// move: LABAS round the self at the centre of a crowd; two shock rings out of the chest
// that tint every line they pass warm; fireflies thrown out through all of it; and, as
// the camera cranes away to planet scale, the ground bent into a little world (every
// vertex mapped onto a sphere whose radius shrinks from ~flat to 110 m). WAKAS folds the
// same geometry back into the one light, the far side first. One module-level instance,
// so the programs and buffers are built once for both scenes.

import type { AudioData } from '../../engine/audio';
import { FPS } from '../../engine/config';
import { Pass, type RT } from '../../engine/gl';
import { Lyrics, type Word } from '../../engine/lyrics';
import { lin, type RGB } from '../../engine/palette';
import type { Post } from '../../engine/scene';
import { clamp, ease, hash, keys, lerp, noise1, prog, smoothstep, TAU } from '../../engine/util';
import { camUniforms, handheld, orbit, shots, type Basis, type Cam } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, dist, mix3, mul, sub, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { GLSL_SDF } from '../../engine/3d/sdf.glsl';
import { bars } from './_fx';
import { building, figure, FIGURE_GLSL, HEAD_R, INK, lerpPose, POSE, scatter, toWorld, walk, wireBox, type Figure, type Place, type Pose } from './_labas';
import { EMBER, GOLD } from './_self';

/** how far (flat metres) the world reaches from the self */
const FAR = 280;
const N_FLY = 6400, N_NEAR = 24;
const WALK_V = 1.35;

// ---------------------------------------------------------------- GLSL

// uR: planet radius (1e5 ≈ flat). uFoldC: fold centre (the chest) and progress 0..1.
// uShk: shock ring 1 radius, height; ring 2 radius, height (flat metres from the centre).
const BEND = /* glsl */ `
uniform float uR;
uniform vec4 uFoldC, uShk;
vec3 shock2(vec3 p) {
  float r = length(p.xz);
  float x1 = r - uShk.x, x2 = r - uShk.z, w1 = 1.4 + uShk.x * .08, w2 = 2. + uShk.z * .07;
  float k = (uShk.y * exp(-x1 * x1 / (w1 * w1)) + uShk.w * exp(-x2 * x2 / (w2 * w2))) / (1. + r * .03);
  k *= smoothstep(1., 3., r);
  p.y += k;
  p.xz += p.xz / max(r, 1e-3) * k * .35;
  return p;
}
// flat → sphere of radius uR touching the ground at the origin: distances from the centre
// become arc lengths, heights stay radial
vec3 bend(vec3 p) {
  float r = length(p.xz);
  if (r < 1e-4) return p;
  float th = r / uR, h = sin(th * .5);
  vec2 xz = p.xz / r * sin(th) * (uR + p.y);
  return vec3(xz.x, p.y * cos(th) - 2. * uR * h * h, xz.y);
}
// how much of a point r flat metres out is left (1 = untouched): the far world goes first
float foldS(float r) {
  if (uFoldC.w <= 0.) return 1.;
  float u = clamp((uFoldC.w - .45 * (1. - clamp(r / ${FAR}., 0., 1.))) / .55, 0., 1.);
  return 1. - u * u * (3. - 2. * u);
}
vec3 fold(vec3 p, float r) {
  float s = foldS(r);
  if (s >= 1.) return p;
  vec3 v = p - uFoldC.xyz;
  float a = (1. - s) * (1. - s) * 2.4, c = cos(a), sn = sin(a);
  v.xz = mat2(c, -sn, sn, c) * v.xz;
  return uFoldC.xyz + v * s;
}
// 0 when the planet is between the camera and q (stable for huge uR: expanded at the pole)
float planetOcc(vec3 q) {
  vec3 v = q - uCamPos, g = uCamPos;
  float L = length(v);
  vec3 rd = v / L;
  float c = dot(g, g) + 2. * uR * g.y, b = dot(g, rd) + uR * rd.y, h = b * b - c;
  if (c <= 0. || h <= 0. || b >= 0.) return 1.;
  return smoothstep(-1.5, 0., c / (-b + sqrt(h)) - L);
}`;

// The light on the lines: a pool round the self's chest, and behind the flood front
// (uFront, flat metres) everything recoloured to the firefly's gold → ember, with a hot
// band riding the front. The far side of the planet is dimmed. warp stores the bent
// position and flat radius of each end in gA / gB for tint.
const FLOOD = /* glsl */ `
uniform vec3 uSelfC;
uniform float uSelfI, uFront, uFloodI;
vec4 gA, gB;
vec4 world(vec4 c, vec4 g) {
  vec3 q = g.xyz;
  float r = g.w;
  float L = dot(c.rgb, vec3(.3, .55, .15));
  vec3 w = mix(C_GLOW, C_EMBER, smoothstep(5., 90., r));
  vec3 dv = q - uSelfC;
  float near = uSelfI / (1. + dot(dv, dv) * .05);
  float x = r - uFront;
  float lit = uFloodI * (1. - smoothstep(-8., 1., x)) * (.3 + 1.6 * exp(-r / 24.));
  float band = uFloodI * exp(-x * x / (9. + r * .8)) * 2.2;
  float m = clamp(near * .45 + lit, 0., 1.);
  vec3 col = mix(c.rgb, w * (L * 2. + .01), m) * (1. + near * 1.2 + lit * .5) + w * (L + .005) * band;
  vec3 n = normalize(vec3(q.x, q.y + uR, q.z));
  float vis = mix(.07, 1., smoothstep(-.02, .012, dot(n, normalize(uCamPos - q))));
  return vec4(col, c.a * vis * smoothstep(0., .35, foldS(r)));
}`;

const LAND_GLSL = BEND + FLOOD + /* glsl */ `
vec3 warp(vec3 p, vec4 d, float end) {
  float r = length(p.xz);
  vec3 q = bend(shock2(p));
  if (end < .5) gA = vec4(q, r); else gB = vec4(q, r);
  return fold(q, r);
}
vec4 tint(vec4 c, vec3 p, vec4 d) { return world(c, (gl_VertexID >> 1) == 0 ? gA : gB); }`;

// figures: the kit's idle motion first, then the world's. Alpha carries a copy tag
// (alpha + 10·tag): 1 = the standing copy, 2 = the cheering copy, crossfaded as the second
// ring passes (uCheerR).
const CROWD_GLSL = FIGURE_GLSL.replace('vec3 warp(', 'vec3 figWarp(') + BEND + FLOOD + /* glsl */ `
uniform float uCheer, uCheerR;
vec3 warp(vec3 p, vec4 d, float end) {
  vec3 f = figWarp(p, d, end);
  float r = length(f.xz);
  vec3 q = bend(shock2(f));
  if (end < .5) gA = vec4(q, r); else gB = vec4(q, r);
  return fold(q, r);
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float tag = floor(c.a / 10.);
  c.a -= tag * 10.;
  vec4 g = (gl_VertexID >> 1) == 0 ? gA : gB;
  float ch = uCheer * (1. - smoothstep(uCheerR - 3., uCheerR + 1., g.w));
  c.a *= tag == 1. ? 1. - ch : tag == 2. ? ch : 1.;
  return world(c, g);
}`;

// The eruption, closed form. aP.xyz = (τ out, τ up, seed), d = (bearing, reach, height,
// birth): out of the chest, arcing up and away, settling to wander where they land.
// Sub-pixel ones get back most of the intensity GlowPoints trades for size, so the far
// ones still read at planet scale.
const ERUPT = BEND + /* glsl */ `
uniform float uNow;
vec4 gP;
vec3 warp(vec3 p, vec4 d) {
  float tau = max(uNow - d.w, 0.);
  float k = 1. - exp(-tau / p.x), kh = 1. - exp(-tau / p.y);
  float a = d.x + k * (fract(p.z * 3.7) - .5) * 1.6;
  float r = d.y * k;
  float h = mix(1.33, d.z, kh) + sin(3.14159 * min(k * 1.2, 1.)) * (.4 + sqrt(d.y) * .45);
  float ph = p.z * 60.;
  vec3 wob = vec3(sin(uNow * .9 + ph), .6 * sin(uNow * 1.3 + ph * 1.7), cos(uNow * .7 + ph * .6)) * (.2 + d.y * .005) * kh;
  vec3 f = vec3(sin(a) * r, h, cos(a) * r) + wob;
  float rf = length(f.xz);
  vec3 q = bend(f);
  gP = vec4(q, rf);
  return fold(q, rf);
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float tau = uNow - d.w;
  if (tau < 0.) return vec4(0.);
  float s = foldS(gP.w);
  // born inside the chest light: fade in as they leave it, so thousands never pile up there
  float hot = (1. + 1.2 * exp(-tau * 3.)) * smoothstep(0., .22, tau);
  float calm = mix(1., .38, smoothstep(1., 3.5, tau));
  float tw = .7 + .3 * sin(uNow * (2.5 + fract(d.x * 7.1) * 5.) + d.x * 50.);
  float sig = -aP.w * pxPerUnit(max(toView(p).z, 1e-3));
  float boost = clamp(pow(.8 / max(sig, 1e-4), 1.6), 1., 60.);
  float occ = mix(1., planetOcc(gP.xyz), s);
  return vec4(c.rgb * tw, c.a * hot * calm * boost * occ * smoothstep(0., .3, s));
}`;

// Sky and ground in one: the ray against the (folded) planet, a sphere of radius uRho
// whose top is uT, expanded about that point so a 1e5 m radius stays exact. LABAS's cool
// air near the ground; black space, stars and a lit rim once the camera is far out.
const PLANET = /* glsl */ `
${GLSL_SDF}
uniform vec3 uTop, uHor, uGround, uWarmCol, uT, uSelfG;
uniform float uRho, uRf, uBand, uWarm, uSpace, uFloodI, uFront, uSelfI, uRim;
vec3 stars(vec3 rd) {
  vec3 g = rd * 260., id = floor(g);
  float st = hash13(id);
  if (st < .992) return vec3(0.);
  vec3 o = vec3(hash13(id + 1.), hash13(id + 2.), hash13(id + 3.)) * .6 + .2;
  return vec3(.85, .9, 1.) * smoothstep(.16, 0., length(fract(g) - o)) * (st - .992) * 250.;
}
void main() {
  vec3 ro = uCamPos, rd = camRay();
  vec3 g = ro - uT;
  float c = dot(g, g) + 2. * uRho * g.y;
  float b = dot(g, rd) + uRho * rd.y, h = b * b - c;
  float oc = sqrt(max(c + uRho * uRho, 1e-6));
  vec3 up = (g + vec3(0., uRho, 0.)) / oc;
  float A = c / (oc + uRho);
  float sh = -sqrt(max(A * (2. * uRho + A), 0.)) / (uRho + A);
  // angle above (+) or below (−) the planet's limb, radians
  float hh = acos(sh) - acos(clamp(dot(rd, up), -1., 1.));
  vec3 col;
  if (h > 0. && b < 0. && c > 0.) {
    float tt = c / (-b + sqrt(h));
    vec3 q = g + rd * tt, wp = uT + q;
    float r = uRf * atan(length(q.xz), q.y + uRho);
    float dip = max(-hh, 0.);
    col = mix(uHor, uGround, smoothstep(0., .15, dip)) + uHor * uBand * .6 * exp(-dip * 60.);
    col += uWarmCol * uWarm * exp(-dip * 30.) * .4;
    vec3 pl = uGround * .7 + uWarmCol * uRim * exp(-dip * 18.) * .5;
    col = mix(col, pl, uSpace);
    col += C_EMBER * uSelfI * .018 * exp(-length(wp.xz - uSelfG.xz) / 4.);
    float x = r - uFront;
    col += mix(C_GLOW, C_EMBER, smoothstep(5., 90., r)) * uFloodI * (1. - smoothstep(-8., 1., x)) * (.003 + .02 * exp(-r / 20.));
  } else {
    float e = max(hh, 0.);
    col = mix(uHor, uTop, smoothstep(0., .6, e)) + uHor * uBand * exp(-e * 40.);
    col += uWarmCol * uWarm * (exp(-e * 12.) * .6 + exp(-e * 90.));
    vec3 sp = vec3(.0003, .0004, .0009) + stars(rd) + uWarmCol * uRim * (exp(-e * 90.) + exp(-e * 14.) * .03);
    col = mix(col, sp, uSpace);
  }
  fragColor = vec4(col, 1.);
}`;

// ---------------------------------------------------------------- CPU mirrors

function foldS(r: number, K: number): number {
  if (K <= 0) return 1;
  const u = clamp((K - 0.45 * (1 - clamp(r / FAR))) / 0.55);
  return 1 - u * u * (3 - 2 * u);
}
function foldP(p: V3, C: V3, K: number): V3 {
  const s = foldS(Math.hypot(p[0], p[2]), K);
  if (s >= 1) return p;
  const a = (1 - s) ** 2 * 2.4, c = Math.cos(a), sn = Math.sin(a), v = sub(p, C);
  return add(C, mul([c * v[0] + sn * v[2], v[1], -sn * v[0] + c * v[2]], s));
}

// ---------------------------------------------------------------- geometry

/** a LineBatch that cuts long segments so the bend can curve them */
class SubBatch extends LineBatch {
  constructor(cap: number, glsl: string, private maxLen = 4) {
    super(cap, glsl);
  }
  override seg(a: V3, b: V3, w: number, col: RGB, alpha = 1, data?: ArrayLike<number>, wb = w) {
    const n = Math.max(1, Math.ceil(dist(a, b) / this.maxLen));
    if (n === 1) return super.seg(a, b, w, col, alpha, data, wb);
    for (let i = 0; i < n; i++)
      super.seg(mix3(a, b, i / n), mix3(a, b, (i + 1) / n), lerp(w, wb, i / n), col, alpha, data, lerp(w, wb, (i + 1) / n));
    return this;
  }
}

/** the ground: every line to `near`, every `major`-th out to FAR; 2 m pieces near, 5 m out */
function planetGrid(L: LineBatch, near: number, step: number, major: number, col: RGB, a: number) {
  const N = Math.floor(FAR / step);
  for (let i = -N; i <= N; i++) {
    const v = i * step, maj = i % major === 0, ext = maj ? FAR : near;
    if (Math.abs(v) >= ext) continue;
    const R = Math.sqrt(ext * ext - v * v), us: number[] = [];
    for (let u = -R; u < R; u += Math.max(Math.abs(u), Math.abs(v)) < near ? 2 : 5) us.push(u);
    us.push(R);
    for (let k = 0; k + 1 < us.length; k++) {
      const u0 = us[k], u1 = us[k + 1], r = Math.hypot((u0 + u1) / 2, v);
      const f = maj ? 1 - smoothstep(FAR * 0.72, FAR, r) : 1 - smoothstep(near * 0.5, near, r);
      if (f < 0.003) continue;
      const al = a * f * (maj ? 1 : 0.45);
      L.seg([v, 0, u0], [v, 0, u1], 1, col, al);
      L.seg([u0, 0, v], [u1, 0, v], 1, col, al);
    }
  }
}

/** addFigure with a coarser head ring and a copy tag packed into alpha (see CROWD_GLSL) */
function addFig(L: LineBatch, fig: Figure, m: Place, id: number, col: RGB, alpha: number, tag: number, headN: number) {
  const a = alpha + 10 * tag;
  for (const [p, q] of fig.segs) L.seg(toWorld(m, p), toWorld(m, q), 1, col, a, [id, 0, 0, 0]);
  const c = toWorld(m, fig.head), r = HEAD_R * (m.scale ?? 1);
  for (let k = 0; k < headN; k++) L.seg(c, c, 1, col, a, [id, r, (k / headN) * TAU, ((k + 1) / headN) * TAU]);
}

const pose = (p: Partial<Pose>): Pose => ({ ...POSE.stand, ...p });
/** arrived: head up */
const TALL = pose({ lean: -0.02, nod: -0.06 });
/** "Mag-stand out": opening, chin up */
const OPEN = pose({ lean: -0.05, nod: -0.16, armL: [0.25, 0.75, 0.2], armR: [0.25, 0.75, 0.2] });
/** "ako": arms wide, face to the sky */
const WIDE = pose({ lean: -0.1, nod: -0.32, armL: [0.1, 1.4, 0.1], armR: [0.1, 1.4, 0.1] });

// ---------------------------------------------------------------- the world

export interface Cues {
  /** gitna's cut: the flare opens here */
  open: number;
  /** the self arrives at the centre */
  stop: number;
  /** "Mag-stand" (first ring) and "ako" (second ring, the crane out) */
  mag: number;
  ako: number;
  bar1: number;
  bar2: number;
  w: { mag: Word; out: Word; din: Word; ako: Word };
}

export interface WorldFrame {
  t: number;
  beat: number;
  b: Basis;
  /** the self's light (lightOf LIWANAG, with any scene flare) */
  light: number;
  /** WAKAS: 0 → 1 as the world folds into the chest */
  fold?: number;
}

export class GitnaWorld {
  T!: Cues;
  private ready = false;
  private Z0 = 0;
  private sky = new Pass(PLANET);
  private grid = new LineBatch(26000, LAND_GLSL);
  private town = new SubBatch(9000, LAND_GLSL, 4);
  private crowd = new LineBatch(40000, CROWD_GLSL);
  private body = new LineBatch(64, CROWD_GLSL);
  private flies = new GlowPoints(N_FLY, ERUPT);
  private near = new GlowPoints(N_NEAR);
  private glow = new GlowPoints(8);

  /** gitna passes its cut; wakas (which never looks before it) needn't */
  init(L: Lyrics, A: AudioData, open?: number) {
    if (!this.ready) {
      const p = L.find('Baka sa tahimik'), s = L.find('Mag-stand out');
      const w = { mag: Lyrics.word(s, 'Mag-stand'), out: Lyrics.word(s, 'out'), din: Lyrics.word(s, 'din'), ako: Lyrics.word(s, 'ako') };
      const baka = Lyrics.word(p, 'Baka').start;
      const [bar1, bar2] = bars(A, baka + 1, w.mag.start);
      // the timeline's cut (the beat before the line), so WAKAS alone sees the same world
      const open = Math.round(A.timeOfBeat(Math.floor(A.beatAt(p.start - 0.12))) * FPS) / FPS;
      this.T = { open: Math.min(open, baka), stop: Lyrics.word(p, 'paraan').end, mag: w.mag.start, ako: w.ako.start, bar1, bar2, w };
      this.build();
      this.ready = true;
    }
    if (open !== undefined) this.T.open = open;
    this.Z0 = this.walked(this.T.stop);
  }

  private build() {
    const T = this.T;
    planetGrid(this.grid, 40, 2, 5, INK.dim, 0.55);

    // the school round the yard, the lane (+z) left open; houses out over the world
    const L = this.town;
    for (let k = 0; k < 7; k++) {
      const a = 0.62 + (k * (TAU - 1.24)) / 6, r = 50 + 12 * hash(k, 3, 1);
      const W = 22 + 14 * hash(k, 3, 2), H = 8 + 5 * hash(k, 3, 3);
      building(L, [Math.sin(a) * r, 0, Math.cos(a) * r], { size: [W, H, 9], yaw: a, floors: H > 10 ? 3 : 2, bays: Math.round(W / 3), col: INK.line, alpha: 0.7 });
    }
    for (let i = 0; i < 80; i++) {
      const a = hash(i, 5, 1) * TAU, r = 85 + 170 * Math.sqrt(hash(i, 5, 2));
      const c: V3 = [Math.sin(a) * r, 0, Math.cos(a) * r], yaw = hash(i, 5, 3) * TAU;
      const hx = 1.8 + 2.4 * hash(i, 5, 4), hy = 1.4 + 2 * hash(i, 5, 5), hz = 1.8 + 1.6 * hash(i, 5, 6);
      wireBox(L, add(c, [0, hy, 0]), [hx, hy, hz], yaw, 1, INK.dim, 0.55);
      // a gable
      const ax: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)], az: V3 = [Math.sin(yaw), 0, Math.cos(yaw)];
      const ridge = (s: number) => add(add(c, [0, 2 * hy + 1.2 * hx * 0.6, 0]), mul(az, s * hz));
      L.seg(ridge(-1), ridge(1), 1, INK.dim, 0.5);
      for (const s of [-1, 1]) {
        L.seg(add(add(c, [0, 2 * hy, 0]), add(mul(ax, s * hx), mul(az, -hz))), ridge(-1), 1, INK.dim, 0.5);
        L.seg(add(add(c, [0, 2 * hy, 0]), add(mul(ax, s * hx), mul(az, hz))), ridge(1), 1, INK.dim, 0.5);
      }
    }

    // the crowd, all facing the centre: the ring near the self in two copies (standing,
    // cheering), the rest once, with coarser heads
    const inner = scatter(280, { r0: 2.6, r1: 15, gap: [0, 0.28], seed: 31 });
    inner.forEach((m, i) => {
      addFig(this.crowd, figure(m.pose ?? POSE.stand), m, i + 1, INK.line, 0.5, 1, 10);
      addFig(this.crowd, figure(POSE.cheer), m, i + 1, INK.line, 0.5, 2, 10);
    });
    const outer = scatter(800, { r0: 15, r1: 44, gap: [0, 0.12], seed: 37 });
    outer.forEach((m, i) => addFig(this.crowd, figure(m.pose ?? POSE.stand), m, 1000 + i, INK.line, 0.4, 0, 6));

    // the eruption: a burst on "Mag-stand", a stream through "out din", the big one on "ako"
    const F = this.flies;
    for (let i = 0; i < N_FLY; i++) {
      const h = (k: number) => hash(i, 71, k);
      const wave = i < 1800 ? 0 : i < 2500 ? 1 : 2;
      const birth = wave === 0 ? T.mag + 0.8 * h(1) ** 2 : wave === 1 ? T.mag + 0.25 + (T.ako - T.mag - 0.3) * h(1) : T.ako + 0.6 * h(1) ** 2;
      const reach = wave === 2 ? Math.exp(lerp(Math.log(4), Math.log(320), h(2) ** 0.8)) : Math.exp(lerp(Math.log(1.8), Math.log(120), h(2)));
      const H = h(3) < 0.12 ? 5 + 22 * h(4) : 0.35 + 4 * h(4) ** 1.4;
      const tOut = (0.3 + 0.55 * h(5)) * (1 + reach / 120) ** 0.4;
      const size = h(7) < 0.04 ? -0.05 : -(0.011 + 0.016 * h(8));
      F.point([tOut, 0.5 + 1.4 * h(6), h(11)], size, mul(h(9) < 0.25 ? EMBER : GOLD, h(9) < 0.25 ? 2 : 2.4), 0.5 + 0.7 * h(10), [h(12) * TAU, reach, H, birth]);
    }
  }

  // ---- the self: walks down the lane to the centre, stops, opens

  private speed(u: number) {
    return WALK_V * (1 - prog(u, this.T.stop - 0.9, this.T.stop, ease.inOutSine));
  }
  /** metres walked since the open (Simpson, pure in t) */
  private walked(t: number) {
    const a = this.T.open, b = Math.min(Math.max(t, a), this.T.stop), n = 64, h = (b - a) / n;
    let s = 0;
    for (let i = 0; i <= n; i++) s += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * this.speed(a + i * h);
    return (s * h) / 3;
  }
  self(t: number): { m: Place; pose: Pose } {
    const T = this.T, s = this.walked(t);
    const shy = 1 - prog(t, T.open, T.stop, ease.inOutSine);
    let p = walk(s / 1.5, this.speed(t) / WALK_V);
    p = { ...p, nod: lerp(0.05, 0.42, shy), lean: p.lean + 0.05 * shy };
    p = lerpPose(p, TALL, prog(t, T.stop - 0.35, T.stop + 0.3, ease.inOutSine));
    p = lerpPose(p, OPEN, prog(t, T.mag - 0.08, T.mag + 0.5, ease.outBackSoft));
    p = lerpPose(p, WIDE, prog(t, T.ako - 0.05, T.ako + 0.55, ease.outBackSoft));
    return { m: { pos: [0, 0, this.Z0 - s], yaw: Math.PI }, pose: p };
  }
  chest(t: number): V3 {
    const { m, pose } = this.self(t);
    return toWorld(m, figure(pose).chest);
  }

  /** planet radius: flat until the crane is well up, then rolling up to 110 m */
  R(t: number) {
    return Math.exp(lerp(Math.log(9e4), Math.log(110), prog(t, this.T.ako + 0.15, this.T.ako + 2.4, ease.inOutSine)));
  }

  // ---- the camera

  private closeCam(u: number): Cam {
    const T = this.T, d0 = u - T.open;
    const d = Math.exp(lerp(Math.log(0.3), Math.log(3.2), prog(u, T.open, T.open + 1.3, ease.outExpo))) + 0.1 * d0;
    return handheld(orbit(add(this.chest(u), [0, 0.03, 0]), Math.PI - 0.3 + 0.12 * Math.sin(d0 * 0.6), -0.06 + 0.025 * d0, d, 42), u, 0.003, 0.5, 7);
  }
  private high(u: number): Cam {
    const d0 = u - this.T.bar1;
    return handheld(orbit(this.chest(u), Math.PI / 2 + 0.6 + 0.07 * d0, 0.4 - 0.025 * d0, 8.6 - 0.45 * d0, 38), u, 0.003, 0.5, 8);
  }
  /** behind the shoulder as they arrive, then up and away; `push` (log) pulls it back in */
  private crane(u: number, push: number): Cam {
    const T = this.T;
    const pre = lerp(Math.log(2.3), Math.log(9.5), prog(u, T.stop - 0.2, T.ako, ease.inOutSine));
    const slam = Math.log(850 / 9.5) * prog(u, T.ako, T.ako + 3.1, ease.outQuart);
    const ld = pre + slam + 0.03 * Math.max(0, u - T.ako) - push;
    const pitch = keys(u, [
      [T.stop, 0.1], [T.mag, 0.2, ease.inOutSine], [T.ako, 0.42, ease.inOutSine],
      [T.ako + 1.5, 1.2, ease.inOutSine], [T.ako + 3.1, 1.45, ease.outSine],
    ]);
    const yaw = 0.2 + 0.9 * prog(u, T.stop, T.ako + 3.1, ease.inOutSine) + 0.04 * Math.max(0, u - T.stop);
    const fov = lerp(44, 36, prog(u, T.ako, T.ako + 2.5, ease.inOutSine));
    const dk = u - T.ako, roll = dk > 0 ? 0.07 * Math.sin(TAU * 1.6 * dk) * Math.exp(-3.5 * dk) : 0;
    const tgt = add(this.chest(u), [0, 0.12 * (1 - prog(u, T.mag, T.ako + 1, ease.inOutSine)), 0]);
    return handheld(orbit(tgt, yaw, pitch, Math.exp(ld), fov, roll), u, 0.0025, 0.45, 5);
  }
  cam(t: number, push = 0): Cam {
    const T = this.T;
    return shots(t, [
      { t: T.open, cam: (u) => this.closeCam(u) },
      { t: T.bar1, cam: (u) => this.high(u), snap: 0.55, kick: 0.05 },
      { t: T.bar2, cam: (u) => this.crane(u, push), snap: 0.45, kick: -0.05 },
    ]);
  }

  // ---- drawing

  private state(s: WorldFrame) {
    const T = this.T, t = s.t, K = s.fold ?? 0, R = this.R(t), C = this.chest(t);
    const camD = dist(s.b.pos, C);
    const tm = t - T.mag, ta = t - T.ako;
    const r1 = tm > 0 ? 17 * tm : -1, r2 = ta > 0 ? 330 * (1 - Math.exp(-ta / 0.95)) : -1;
    const flood = tm > 0 ? lerp(0.55 * prog(t, T.mag, T.mag + 0.3), 1, prog(t, T.ako, T.ako + 0.5)) : 0;
    const U = {
      ...camUniforms(s.b),
      uR: R, uFoldC: [...C, K], uNow: t,
      uShk: [Math.max(r1, 0), tm > 0 ? 0.5 * Math.exp(-tm * 1.2) : 0, Math.max(r2, 0), ta > 0 ? 1.5 * Math.exp(-ta * 0.9) : 0],
      uSelfC: C, uSelfI: s.light * 0.9, uFront: Math.max(r1, r2), uFloodI: flood,
    };
    const fog: [number, number] = [14 + camD, 0.02 / (1 + camD / 12)];
    // folding, the world leaves the one light in the dark however close the camera comes
    const space = Math.max(smoothstep(60, 400, camD), smoothstep(0, 0.45, K));
    return { t, K, R, C, camD, U, fog, flood, space, ta };
  }

  /** the planet and sky: fills `out` */
  back(out: RT, s: WorldFrame) {
    const st = this.state(s), T = this.T, sig = foldS(150, st.K), foot = this.self(s.t).m.pos;
    const open = 1 - prog(s.t, T.open, T.open + 1.6, ease.outCubic);
    this.sky.draw(out, {
      ...camUniforms(s.b),
      uTop: mul(lin('ink'), 0.8), uHor: mul(lin('slate'), 0.55), uGround: mul(lin('ink'), 0.9), uBand: 0.7,
      uWarmCol: mix3(GOLD, EMBER, 0.6), uWarm: 0.5 * open + 0.45 * st.flood * sig,
      uT: mul(st.C, 1 - sig), uRho: sig * st.R, uRf: st.R, uSelfG: foot,
      uSpace: st.space, uRim: 0.45 * st.flood * sig, uSelfI: st.U.uSelfI, uFloodI: st.flood * sig, uFront: st.U.uFront,
    });
  }

  /** everything in it */
  front(out: RT, s: WorldFrame) {
    const st = this.state(s), T = this.T, t = s.t;
    this.grid.draw(out, s.b, { fog: st.fog, uniforms: st.U });
    this.town.draw(out, s.b, { fog: st.fog, uniforms: st.U });
    const figU = { uBeat: s.beat, uSway: 0.04, uBob: lerp(0.015, 0.05, prog(t, T.ako, T.ako + 0.4)), uGroundY: 0, uCheer: st.ta > 0 ? 1 : 0, uCheerR: st.U.uFront };
    this.crowd.draw(out, s.b, { fog: st.fog, uniforms: { ...st.U, ...figU } });

    const { m, pose } = this.self(t);
    this.body.clear();
    addFig(this.body, figure(pose), m, 0, mul(lin('paper'), 0.7), 1, 0, 14);
    this.body.draw(out, s.b, { fog: st.fog, uniforms: { ...st.U, ...figU, uSway: 0, uBob: 0, uCheer: 0 } });

    if (t > T.mag - 0.1) this.flies.draw(out, s.b, { nearFade: 0.3, uniforms: st.U });

    // a few of the light's own, circling the self on the walk; they go with the first burst
    const keep = 1 - prog(t, T.mag, T.mag + 0.3);
    if (keep > 0) {
      this.near.clear();
      for (let i = 0; i < N_NEAR; i++) {
        const h = (k: number) => hash(i, 5, k);
        const a = h(1) * TAU + (h(2) < 0.5 ? -1 : 1) * (0.5 + 0.8 * h(3)) * (t - T.open), r = 0.35 + 1.1 * h(4);
        const y = 0.25 * Math.sin(t * (0.6 + h(5)) * 1.9 + h(6) * 9) + (h(7) - 0.5) * 0.8;
        const tw = 0.65 + 0.35 * Math.sin(t * (3 + 4 * h(8)) + h(9) * 40);
        this.near.point(foldP(add(st.C, [Math.sin(a) * r, y, Math.cos(a) * r]), st.C, st.K), -(0.012 + 0.01 * h(10)), mul(GOLD, 2.2), s.light * 0.5 * tw * keep);
      }
      this.near.draw(out, s.b, { nearFade: 0.2 });
    }

    // the light: world-sized up close, a screen-sized star as the camera leaves
    const I = s.light * (1 + 0.07 * noise1(t * 7.3, 11) + 0.04 * noise1(t * 19.1, 12));
    if (I <= 0) return;
    const far = smoothstep(10, 120, st.camD);
    this.glow.clear();
    this.glow.point(st.C, -0.022, mul(GOLD, 3), I);
    this.glow.point(st.C, -0.09, EMBER, I * 0.12);
    this.glow.point(st.C, -0.36, EMBER, I * 0.018);
    if (far > 0) {
      this.glow.point(st.C, 1.6, mul(GOLD, 3), I * far * 0.5);
      this.glow.point(st.C, 7, EMBER, I * far * 0.2);
      this.glow.point(st.C, 24, EMBER, I * far * 0.02);
    }
    this.glow.draw(out, s.b);
  }

  /** the look both scenes share (so the cut between them is invisible) */
  post(b: Basis, t: number, fold = 0): Post {
    const sp = Math.max(smoothstep(60, 400, dist(b.pos, this.chest(t))), smoothstep(0, 0.45, fold));
    return { exposure: 1.12, bloom: lerp(0.72, 0.62, sp), bloomRadius: lerp(1.05, 1.12, sp), vignette: lerp(0.34, 0.42, sp), grain: 0.04 };
  }
}

let world: GitnaWorld | null = null;
export const gitnaWorld = () => (world ??= new GitnaWorld());
