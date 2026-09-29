// LABAS, the world outside: cool hairline line art in 3D (the notebook's pencil, now in
// space). A sky that only ever holds grey light, a ground grid to the horizon, line
// figures and crowds of thousands, a few props. Units are metres, the ground is y = 0,
// a figure faces +z. Nothing here is warm: warm light belongs to the self (_self.ts) and
// to LOOB, and only floods in here through `Sky`'s warm term when the film allows it.

import { Pass, type RT } from '../../engine/gl';
import { lin, type RGB } from '../../engine/palette';
import { camUniforms, type Basis } from '../../engine/3d/camera';
import type { DrawOpts } from '../../engine/3d/geo';
import { LineBatch } from '../../engine/3d/lines';
import { add, cross, madd, mul, norm, rotX, rotY, rotZ, sub, type V3 } from '../../engine/3d/math';
import { GLSL_SDF } from '../../engine/3d/sdf.glsl';
import { hash, lerp, smoothstep, TAU } from '../../engine/util';

export const INK = {
  /** figures and near props */
  line: lin('ash'),
  /** brighter, for the self and anything the eye should find */
  bright: mul(lin('paper'), 0.62),
  /** pencil: the self as a dark shape against LOOB's glow */
  shade: mul(lin('pencil'), 1.25),
  /** grid, far structure */
  dim: lin('graphite'),
  faint: lin('slate'),
  sea: lin('sea'),
};
/** the default depth haze of LABAS lines: [start, density per metre] */
export const LABAS_FOG: [number, number] = [14, 0.02];

// ---------------------------------------------------------------- sky

const SKY = /* glsl */ `
${GLSL_SDF}
uniform vec3 uTop, uHor, uGround, uWarmDir, uWarmCol;
uniform float uWarm, uBand;
void main() {
  vec3 rd = camRay();
  float h = rd.y;
  vec3 c = h > 0. ? mix(uHor, uTop, smoothstep(0., .6, h)) : mix(uHor, uGround, smoothstep(0., -.2, h));
  // the thin bright band where the ground meets the sky
  c += uHor * uBand * exp(-abs(h) * 60.);
  float w = max(dot(rd, uWarmDir), 0.);
  c += uWarmCol * uWarm * (pow(w, 5.) * .35 + pow(w, 48.) * 1.5 + .05 * exp(-abs(h) * 5.));
  fragColor = vec4(c, 1.);
}`;

export interface SkyOpts {
  top?: RGB;
  hor?: RGB;
  ground?: RGB;
  /** horizon band strength */
  band?: number;
  /** warm light from direction `warmDir` (GITNA's flood, BUO's flare); 0 = none */
  warm?: number;
  warmDir?: V3;
  warmCol?: RGB;
}

export class Sky {
  private pass = new Pass(SKY);
  draw(out: RT, b: Basis, o: SkyOpts = {}) {
    this.pass.draw(out, {
      ...camUniforms(b),
      uTop: o.top ?? mul(lin('ink'), 0.8),
      uHor: o.hor ?? mul(lin('slate'), 0.5),
      uGround: o.ground ?? mul(lin('ink'), 0.9),
      uBand: o.band ?? 0.6,
      uWarm: o.warm ?? 0,
      uWarmDir: norm(o.warmDir ?? [0, 0.15, -1]),
      uWarmCol: o.warmCol ?? lin('ember'),
    });
  }
}

// ---------------------------------------------------------------- ground

export interface GridOpts {
  y?: number;
  /** half-size, metres; lines fade out over the outer 45% */
  extent?: number;
  step?: number;
  /** every n-th line is a major one */
  major?: number;
  centre?: [number, number];
  /** sub-segments per line (long lines are split so fog and fade can vary along them) */
  seg?: number;
  col?: RGB;
  alpha?: number;
  w?: number;
}

/** a square ground grid out to the horizon, fading radially */
export function groundGrid(L: LineBatch, o: GridOpts = {}) {
  const y = o.y ?? 0, R = o.extent ?? 120, s = o.step ?? 2, M = o.major ?? 5;
  const [cx, cz] = o.centre ?? [0, 0];
  const n = Math.floor(R / s), sub = o.seg ?? 24;
  const col = o.col ?? INK.dim, a0 = o.alpha ?? 0.55, w = o.w ?? 1;
  const fade = (x: number, z: number) => 1 - smoothstep(0.55 * R, R, Math.hypot(x, z));
  for (let i = -n; i <= n; i++) {
    const a = a0 * (i % M ? 0.4 : 1);
    for (let k = 0; k < sub; k++) {
      const u0 = -R + (2 * R * k) / sub, u1 = -R + (2 * R * (k + 1)) / sub;
      const v = i * s, f0 = fade(v, u0), f1 = fade(v, u1);
      if (f0 + f1 < 0.002) continue;
      const fa = (f0 + f1) / 2;
      L.seg([cx + v, y, cz + u0], [cx + v, y, cz + u1], w, col, a * fa);
      L.seg([cx + u0, y, cz + v], [cx + u1, y, cz + v], w, col, a * fa);
    }
  }
}

// ---------------------------------------------------------------- figures

export interface Pose {
  /** spine pitch forward (+) / back (−), roll to the side, upper-body yaw, head nod (+ = down) */
  lean: number;
  side: number;
  twist: number;
  nod: number;
  /** [swing forward, raise out to the side, elbow bend], radians */
  armL: V3;
  armR: V3;
  /** [swing forward, knee bend], radians */
  legL: [number, number];
  legR: [number, number];
  /** pelvis drop, metres (sit, crouch) */
  drop: number;
}

const STAND: Pose = {
  lean: 0, side: 0, twist: 0, nod: 0.05,
  armL: [0.02, 0.08, 0.12], armR: [0.02, 0.08, 0.12],
  legL: [0, 0], legR: [0, 0], drop: 0,
};
const pose = (p: Partial<Pose>): Pose => ({ ...STAND, ...p });

export const POSE = {
  stand: STAND,
  /** head down, arms in, a little hunched: the quiet one's default */
  shy: pose({ lean: 0.08, nod: 0.45, armL: [0.1, 0.02, 0.35], armR: [0.1, 0.02, 0.35] }),
  /** head thrown back, hands up by the belly */
  laugh: pose({ lean: -0.18, nod: -0.35, armL: [0.55, 0.3, 1.5], armR: [0.45, 0.35, 1.4] }),
  /** one hand out, mid-sentence */
  talk: pose({ nod: -0.08, twist: 0.15, armR: [0.75, 0.15, 1.5], armL: [0.05, 0.1, 0.25] }),
  /** both arms up */
  cheer: pose({ lean: -0.06, nod: -0.3, armL: [0.2, 2.6, 0.25], armR: [0.2, 2.6, 0.25] }),
  /** sitting on a bench (seat at ~0.48 m) */
  sit: pose({ drop: 0.47, lean: 0.06, legL: [1.5, 1.5], legR: [1.45, 1.52], armL: [0.45, 0.05, 0.6], armR: [0.45, 0.05, 0.6] }),
  /** sitting on the ground hugging the knees */
  hug: pose({ drop: 0.78, lean: 0.38, nod: 0.3, legL: [1.9, 2.5], legR: [1.85, 2.45], armL: [1.05, 0.12, 0.85], armR: [1.05, 0.12, 0.85] }),
};

/** a walk cycle; `ph` in cycles (one cycle = two steps), `amt` 0..1 stride */
export function walk(ph: number, amt = 1): Pose {
  const s = Math.sin(TAU * ph), c = Math.cos(TAU * ph);
  const knee = (x: number) => 0.15 + 0.6 * Math.max(0, x);
  return pose({
    lean: 0.05 * amt,
    twist: 0.08 * s * amt,
    nod: 0.02,
    armL: [-0.35 * s * amt, 0.08, 0.2 + 0.15 * amt],
    armR: [0.35 * s * amt, 0.08, 0.2 + 0.15 * amt],
    legL: [0.4 * s * amt, knee(-c) * amt],
    legR: [-0.4 * s * amt, knee(c) * amt],
    drop: 0.03 * amt * Math.abs(s),
  });
}

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const l = (x: number, y: number) => lerp(x, y, k);
  const l3 = (x: V3, y: V3): V3 => [l(x[0], y[0]), l(x[1], y[1]), l(x[2], y[2])];
  return {
    lean: l(a.lean, b.lean), side: l(a.side, b.side), twist: l(a.twist, b.twist), nod: l(a.nod, b.nod),
    armL: l3(a.armL, b.armL), armR: l3(a.armR, b.armR),
    legL: [l(a.legL[0], b.legL[0]), l(a.legL[1], b.legL[1])],
    legR: [l(a.legR[0], b.legR[0]), l(a.legR[1], b.legR[1])],
    drop: l(a.drop, b.drop),
  };
}

export const HEAD_R = 0.115;
const HEAD_N = 14;

export interface Figure {
  /** body segments in the figure's frame (feet at y = 0, facing +z) */
  segs: [V3, V3][];
  head: V3;
  chest: V3;
  hands: [V3, V3];
}

/** the joints of a posed figure, in its own frame (1.75 m tall standing) */
export function figure(p: Pose): Figure {
  const pel: V3 = [0, 0.95 - p.drop, 0];
  // the upper body turns about the pelvis: yaw, then pitch, then roll
  const ub = (v: V3) => rotZ(rotX(rotY(v, p.twist), p.lean), -p.side);
  const up = ub([0, 1, 0]), sx = ub([1, 0, 0]);
  const shC = madd(pel, up, 0.5);
  const neck = madd(pel, up, 0.56);
  const hd = ub(rotX([0, 1, 0], p.nod));
  const head = madd(neck, hd, 0.02 + HEAD_R);
  const chest = madd(pel, up, 0.38);
  const segs: [V3, V3][] = [];
  const S = (a: V3, b: V3) => segs.push([a, b]);

  const shL = madd(shC, sx, 0.19), shR = madd(shC, sx, -0.19);
  const hipL: V3 = [0.1, pel[1], 0], hipR: V3 = [-0.1, pel[1], 0];
  S(shL, shR);
  S(shL, madd(hipL, up, 0.02));
  S(shR, madd(hipR, up, 0.02));
  S(hipL, hipR);
  S(shC, madd(neck, hd, 0.02));

  const arm = (sh: V3, side: number, [sw, out, el]: V3) => {
    const d0 = rotZ([0, -1, 0], side * out);
    const elbow = madd(sh, ub(rotX(d0, -sw)), 0.3);
    const hand = madd(elbow, ub(rotX(d0, -(sw + el))), 0.27);
    S(sh, elbow);
    S(elbow, hand);
    return hand;
  };
  const hands: [V3, V3] = [arm(shL, 1, p.armL), arm(shR, -1, p.armR)];

  const leg = (hip: V3, [sw, kn]: [number, number]) => {
    const knee = madd(hip, rotX([0, -1, 0], -sw), 0.46);
    const foot = madd(knee, rotX([0, -1, 0], kn - sw), 0.46);
    S(hip, knee);
    S(knee, foot);
    S(foot, add(foot, [0, 0, 0.13]));
  };
  leg(hipL, p.legL);
  leg(hipR, p.legR);
  return { segs, head, chest, hands };
}

export interface Place {
  pos: V3;
  /** facing: radians about +y from +z */
  yaw?: number;
  scale?: number;
}

/** figure frame → world */
export const toWorld = (m: Place, p: V3): V3 => add(m.pos, rotY(mul(p, m.scale ?? 1), m.yaw ?? 0));

/**
 * Add a posed figure to a batch built with FIGURE_GLSL. `id` seeds its idle motion; the
 * head is a ring the shader billboards to face the camera.
 */
export function addFigure(L: LineBatch, fig: Figure, m: Place, id: number, w: number, col: RGB, alpha = 1, headN = HEAD_N) {
  for (const [a, b] of fig.segs) L.seg(toWorld(m, a), toWorld(m, b), w, col, alpha, [id, 0, 0, 0]);
  const c = toWorld(m, fig.head), r = HEAD_R * (m.scale ?? 1);
  for (let k = 0; k < headN; k++) L.seg(c, c, w, col, alpha, [id, r, (k / headN) * TAU, ((k + 1) / headN) * TAU]);
}

/**
 * Figure life on the GPU. d = (id, head radius or 0, ring angle a, b). `uSway` leans each
 * figure about its feet with the beat (a shear, so the feet stay planted), `uBob` bounces
 * the upper body of every other one at twice the beat (laughter). uGroundY is where the
 * feet are.
 */
export const FIGURE_GLSL = /* glsl */ `
uniform float uBeat, uSway, uBob, uGroundY;
vec3 warp(vec3 p, vec4 d, float end) {
  float h = fract(sin(d.x * 91.3458) * 47453.5453), h2 = fract(h * 13.73), h3 = fract(h * 71.9);
  float up = max(p.y - uGroundY, 0.);
  float a = h2 * 6.2831853;
  p.xz += vec2(cos(a), sin(a)) * up * uSway * (.5 + h) * sin(3.14159265 * uBeat + h * 6.2831853);
  p.y += uBob * up * step(.5, h3) * (.5 + .5 * sin(6.2831853 * 2. * uBeat + h * 6.2831853));
  if (d.y > 0.) {
    float t = mix(d.z, d.w, end);
    p += (uCamR * cos(t) + uCamU * sin(t)) * d.y;
  }
  return p;
}`;

export interface Member extends Place {
  pose?: Pose;
  col?: RGB;
  alpha?: number;
}

export interface CrowdDraw extends DrawOpts {
  /** continuous beat index (AudioData.beatAt) */
  beat: number;
  sway?: number;
  bob?: number;
  groundY?: number;
}

/** many static line figures in one batch, animated only by FIGURE_GLSL */
export class Crowd {
  lines: LineBatch;
  constructor(public members: Member[], o: { w?: number; col?: RGB; alpha?: number; seed?: number } = {}) {
    this.lines = new LineBatch(members.length * (15 + HEAD_N), FIGURE_GLSL);
    const figs = new Map<Pose, Figure>();
    members.forEach((m, i) => {
      const p = m.pose ?? POSE.stand;
      if (!figs.has(p)) figs.set(p, figure(p));
      addFigure(this.lines, figs.get(p)!, m, i + 1 + (o.seed ?? 0) * 7919, o.w ?? 1, m.col ?? o.col ?? INK.line, m.alpha ?? o.alpha ?? 1);
    });
  }
  draw(out: RT, b: Basis, o: CrowdDraw) {
    const { beat, sway, bob, groundY, ...d } = o;
    this.lines.draw(out, b, {
      fog: LABAS_FOG,
      ...d,
      uniforms: { uBeat: beat, uSway: sway ?? 0, uBob: bob ?? 0, uGroundY: groundY ?? 0, ...(d.uniforms ?? {}) },
    });
  }
}

export interface ScatterOpts {
  centre?: V3;
  /** annulus radii, metres */
  r0?: number;
  r1?: number;
  /** face this point (default: the centre), or 'out' / 'random' */
  face?: V3 | 'out' | 'random';
  /** leave this wedge empty: [yaw centre, half-width], radians */
  gap?: [number, number];
  poses?: Pose[];
  scale?: [number, number];
  seed?: number;
}

/** n figures scattered in an annulus (uniform by area), in varied poses */
export function scatter(n: number, o: ScatterOpts = {}): Member[] {
  const c = o.centre ?? [0, 0, 0], r0 = o.r0 ?? 0, r1 = o.r1 ?? 20, s = o.seed ?? 1;
  const poses = o.poses ?? [POSE.stand, POSE.stand, POSE.talk, POSE.laugh];
  const [sc0, sc1] = o.scale ?? [0.93, 1.07];
  const out: Member[] = [];
  for (let i = 0; out.length < n && i < n * 4; i++) {
    const a = hash(i, s, 1) * TAU, r = Math.sqrt(lerp(r0 * r0, r1 * r1, hash(i, s, 2)));
    if (o.gap) {
      const da = Math.atan2(Math.sin(a - o.gap[0]), Math.cos(a - o.gap[0]));
      if (Math.abs(da) < o.gap[1]) continue;
    }
    const pos: V3 = [c[0] + Math.sin(a) * r, c[1], c[2] + Math.cos(a) * r];
    const f = o.face ?? c;
    const yaw =
      f === 'random' ? hash(i, s, 3) * TAU
      : f === 'out' ? a
      : Math.atan2(f[0] - pos[0], f[2] - pos[2]) + (hash(i, s, 4) - 0.5) * 0.6;
    out.push({ pos, yaw, scale: lerp(sc0, sc1, hash(i, s, 5)), pose: poses[Math.floor(hash(i, s, 6) * poses.length)] });
  }
  return out;
}

// ---------------------------------------------------------------- props

/** 12 edges of a box: centre, half-size, yaw */
export function wireBox(L: LineBatch, c: V3, h: V3, yaw: number, w: number, col: RGB, a = 1) {
  const P = (x: number, y: number, z: number) => add(c, rotY([x * h[0], y * h[1], z * h[2]], yaw));
  for (const s of [-1, 1])
    for (const t of [-1, 1]) {
      L.seg(P(-1, s, t), P(1, s, t), w, col, a);
      L.seg(P(s, -1, t), P(s, 1, t), w, col, a);
      L.seg(P(s, t, -1), P(s, t, 1), w, col, a);
    }
}

/** a rectangle spanned by unit axes u, v with half-sizes hu, hv */
export function rect(L: LineBatch, c: V3, u: V3, v: V3, hu: number, hv: number, w: number, col: RGB, a = 1) {
  const P = (x: number, y: number) => madd(madd(c, u, x * hu), v, y * hv);
  L.poly([P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)], w, col, a, true);
}

export interface BuildingOpts {
  /** width (x), height, depth (z), metres */
  size: V3;
  yaw?: number;
  floors?: number;
  bays?: number;
  col?: RGB;
  alpha?: number;
  w?: number;
}

/** a school block: outline, floor lines and windows on the long faces; stands on y = pos.y */
export function building(L: LineBatch, pos: V3, o: BuildingOpts) {
  const [W, H, D] = o.size, yaw = o.yaw ?? 0, fl = o.floors ?? 3, bays = o.bays ?? 8;
  const col = o.col ?? INK.line, a = o.alpha ?? 0.8, w = o.w ?? 1;
  wireBox(L, add(pos, [0, H / 2, 0]), [W / 2, H / 2, D / 2], yaw, w, col, a);
  const R = rotY([1, 0, 0], yaw), F = rotY([0, 0, 1], yaw);
  for (const side of [-1, 1]) {
    const face = madd(pos, F, (side * D) / 2 + side * 0.01);
    for (let f = 1; f < fl; f++) {
      const y = (H * f) / fl;
      L.seg(madd(add(face, [0, y, 0]), R, -W / 2), madd(add(face, [0, y, 0]), R, W / 2), w, col, a * 0.6);
    }
    for (let f = 0; f < fl; f++)
      for (let k = 0; k < bays; k++) {
        const x = -W / 2 + (W * (k + 0.5)) / bays, y = (H * (f + 0.55)) / fl;
        rect(L, madd(add(face, [0, y, 0]), R, x), R, [0, 1, 0], (W / bays) * 0.3, (H / fl) * 0.25, w, col, a * 0.55);
      }
  }
}

export interface StageOpts {
  /** platform width, depth, height */
  size?: V3;
  /** proscenium height above the platform */
  arch?: number;
  /** curtain folds per side */
  folds?: number;
  col?: RGB;
  alpha?: number;
  w?: number;
}

/** a school stage facing +z: platform, front steps, proscenium, drawn-back curtains */
export function stage(L: LineBatch, pos: V3, o: StageOpts = {}) {
  const [W, D, H] = o.size ?? [12, 6, 1.1], A = o.arch ?? 5.5, n = o.folds ?? 6;
  const col = o.col ?? INK.line, a = o.alpha ?? 0.85, w = o.w ?? 1;
  wireBox(L, add(pos, [0, H / 2, 0]), [W / 2, H / 2, D / 2], 0, w, col, a);
  for (let k = 1; k <= 3; k++) {
    const y = (H * (3 - k)) / 3, z = D / 2 + 0.3 * k;
    L.seg(add(pos, [-1.5, y, z]), add(pos, [1.5, y, z]), w, col, a * 0.7);
  }
  const top = H + A, fz = D / 2 - 0.2;
  for (const s of [-1, 1]) {
    L.seg(add(pos, [(s * W) / 2, H, fz]), add(pos, [(s * W) / 2, top, fz]), w, col, a);
    // curtain folds: gathered at the side, hanging from the top, a slight wave
    for (let k = 0; k < n; k++) {
      const x0 = s * (W / 2 - 0.25 - k * 0.28), pts: V3[] = [];
      for (let j = 0; j <= 10; j++) {
        const y = top - (A * j) / 10;
        const pull = Math.sin((j / 10) * Math.PI) * 0.35 * (1 - k / n);
        pts.push(add(pos, [x0 + s * pull, y, fz - 0.05 - 0.04 * Math.sin(k * 2.1 + j)]));
      }
      L.poly(pts, w, col, a * 0.5);
    }
  }
  L.seg(add(pos, [-W / 2 - 0.4, top, fz]), add(pos, [W / 2 + 0.4, top, fz]), w, col, a);
  L.seg(add(pos, [-W / 2 - 0.4, top + 0.5, fz]), add(pos, [W / 2 + 0.4, top + 0.5, fz]), w, col, a * 0.7);
}

/** an orthonormal frame facing the camera from `p` (for props that should face it) */
export function facing(b: Basis, p: V3): { R: V3; U: V3; N: V3 } {
  const N = norm(sub(b.pos, p));
  const R = norm(cross([0, 1, 0], N));
  return { R, U: cross(N, R), N };
}
