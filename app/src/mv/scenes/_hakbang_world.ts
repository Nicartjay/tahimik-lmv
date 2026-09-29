// Private helpers for HAKBANG: the slowed clock of "paabante" and "dahan-dahan", the one
// step (poses and where the body goes), the LABAS world laid over the LOOB sea (grid,
// crowd, school blocks in one batch) that the step's shockwave reveals as it passes and
// that stays at dawn, and the ring of sparks the shockwave throws up off the water.

import type { RT } from '../../engine/gl';
import { lin } from '../../engine/palette';
import type { Basis } from '../../engine/3d/camera';
import { LineBatch } from '../../engine/3d/lines';
import { add, mul, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { ease, hash, lerp, prog, TAU } from '../../engine/util';
import { GLSL_SHOCK } from './_fx';
import { addFigure, building, FIGURE_GLSL, figure, groundGrid, INK, POSE, scatter, toWorld, type Pose } from './_labas';
import { O, SELF_POS, SELF_POSE, SELF_YAW } from './_mundo_cosmos';
import { GOLD } from './_self';

// ---------------------------------------------------------------- the slowed clock

/** ∫ of a ramp 0 → 1 over [a, a + r] */
const ramp = (t: number, a: number, r: number) => (t < a ? 0 : t < a + r ? ((t - a) * (t - a)) / (2 * r) : t - a - r / 2);

export interface Slow {
  /** slows from a (over r s), speeds back up from b; clock rate 1 − depth in between */
  a: number;
  b: number;
  r: number;
  depth: number;
}

/** the time the world lives in: song time with the slow-motion stretches taken out (C¹) */
export const warpTime = (t: number, slows: Slow[]) =>
  slows.reduce((w, s) => w - s.depth * (ramp(t, s.a, s.r) - ramp(t, s.b, s.r)), t);

// ---------------------------------------------------------------- the step

const P = (p: Partial<Pose>): Pose => ({ ...POSE.stand, ...p });
/** stood up straight: chin up */
const TALL = P({ nod: -0.06, lean: -0.02 });
/** the right knee up, the weight on the left, the arms answering */
const LIFT = P({ lean: 0.06, nod: -0.02, legR: [0.95, 1.35], legL: [-0.05, 0.05], armL: [0.35, 0.1, 0.3], armR: [-0.3, 0.1, 0.25], drop: 0.02 });
/** the right foot down, a stride long (the pelvis dropped so both feet are on the water) */
const PLANT = P({ lean: 0.1, nod: 0, legR: [0.42, 0.05], legL: [-0.3, 0.15], armL: [0.4, 0.1, 0.3], armR: [-0.3, 0.1, 0.25], drop: 0.09 });
/** the dawn: arms a little open, face up */
const OPEN = P({ nod: -0.16, lean: -0.03, armL: [0.12, 0.35, 0.2], armR: [0.12, 0.35, 0.2] });

export interface StepTimes {
  lakas: number;
  paab: number;
  plant: number;
  pwede: number;
}

/** the self's pose and feet position at t */
export function stepAt(t: number, T: StepTimes): { pose: Pose; pos: V3; yaw: number } {
  const io = ease.inOutSine;
  let p = SELF_POSE;
  p = lerpP(p, TALL, prog(t, T.lakas - 0.2, T.lakas + 1.6, io));
  p = lerpP(p, LIFT, prog(t, T.paab, T.plant - 0.22, io));
  const down = prog(t, T.plant - 0.22, T.plant, ease.inQuad);
  p = lerpP(p, PLANT, down);
  const after = prog(t, T.plant + 0.7, T.plant + 1.9, io);
  p = lerpP(p, TALL, after);
  p = lerpP(p, OPEN, prog(t, T.pwede, T.pwede + 4, io));
  // facing −z: a stride forward, then the back foot brought up
  return { pose: p, pos: add(SELF_POS, [0, 0, -0.28 * down - 0.22 * after]), yaw: SELF_YAW };
}

function lerpP(a: Pose, b: Pose, k: number): Pose {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const l = (x: number, y: number) => lerp(x, y, k);
  const l3 = (x: V3, y: V3): V3 => [l(x[0], y[0]), l(x[1], y[1]), l(x[2], y[2])];
  return {
    lean: l(a.lean, b.lean), side: l(a.side, b.side), twist: l(a.twist, b.twist), nod: l(a.nod, b.nod),
    armL: l3(a.armL, b.armL), armR: l3(a.armR, b.armR),
    legL: [l(a.legL[0], b.legL[0]), l(a.legL[1], b.legL[1])], legR: [l(a.legR[0], b.legR[0]), l(a.legR[1], b.legR[1])],
    drop: l(a.drop, b.drop),
  };
}

/** where the right foot comes down */
export function plantFoot(T: StepTimes): V3 {
  const s = stepAt(T.plant, T);
  return toWorld({ pos: s.pos, yaw: s.yaw }, figure(s.pose).segs[13][1]);
}

// ---------------------------------------------------------------- the outer world, on the sea

/** the water the LABAS lines stand on (just over the calmed swell) */
export const LINE_Y = 0.25;

const WORLD_GLSL = /* glsl */ `
${FIGURE_GLSL.replace('vec3 warp(', 'vec3 figWarp(')}
${GLSL_SHOCK}
uniform float uHold, uWake;
uniform vec3 uCrestCol;
vec3 warp(vec3 p, vec4 d, float end) { return shock(figWarp(p, d, end)); }
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float age = uNow - uShockT;
  if (age < 0.) return vec4(c.rgb, c.a * uHold);
  float x = length(p.xz - uShockC.xz) - age * uShockV;
  // lit gold on the crest, visible in its wake for a while, and whatever uHold keeps
  float crest = exp(-x * x / (5. + 5. * age)) * exp(-age * .3);
  float wake = (1. - smoothstep(-10., 3., x)) * uWake;
  return vec4(c.rgb + uCrestCol * crest, c.a * clamp(max(uHold, wake) + crest * 1.4, 0., 1.6));
}`;

/** grid + crowd + school blocks round the self, all rippled by the step's shockwave */
export class OuterWorld {
  lines = new LineBatch(20000, WORLD_GLSL);
  constructor() {
    const L = this.lines, y = LINE_Y;
    groundGrid(L, { y, extent: 110, step: 2.5, major: 4, centre: [O[0], O[2]], seg: 40, alpha: 0.6 });
    const members = scatter(56, { centre: [O[0], y, O[2]], r0: 14, r1: 46, seed: 17, poses: [POSE.stand, POSE.stand, POSE.shy, POSE.talk] });
    const figs = new Map<Pose, ReturnType<typeof figure>>();
    members.forEach((m, i) => {
      const p = m.pose ?? POSE.stand;
      if (!figs.has(p)) figs.set(p, figure(p));
      addFigure(L, figs.get(p)!, m, i + 1, 1, INK.line, 0.9);
    });
    // the school, far off round the edges of the grid
    for (let i = 0; i < 7; i++) {
      const a = -1.9 + (i / 6) * 3.8 + (hash(i, 31) - 0.5) * 0.3, r = 70 + 22 * hash(i, 32);
      const pos: V3 = [O[0] + Math.sin(a) * r, y, O[2] - Math.cos(a) * r];
      building(L, pos, { size: [22 + 14 * hash(i, 33), 8 + 6 * hash(i, 34), 9], yaw: -a, floors: 3, bays: 9, col: INK.faint, alpha: 0.7 });
    }
  }
  draw(out: RT, b: Basis, o: { now: number; plant: number; foot: V3; hold: number; wake: number; fog: [number, number]; depth?: RT }) {
    this.lines.draw(out, b, {
      fog: o.fog, depth: o.depth,
      uniforms: {
        uBeat: 0, uSway: 0, uBob: 0, uGroundY: LINE_Y,
        uNow: o.now, uShockT: o.plant, uShockC: o.foot, uShockA: SHOCK_AMP, uShockV: SHOCK_V,
        uHold: o.hold, uWake: o.wake, uCrestCol: mul(GOLD, 2.4),
      },
    });
  }
}

export const SHOCK_AMP = 1.2, SHOCK_V = 18;

// ---------------------------------------------------------------- the ring of sparks

const SPRAY = /* glsl */ `
uniform vec3 uC;
uniform float uAge, uV, uAmp;
// p = (angle, lag behind the front, height seed)
vec3 warp(vec3 p, vec4 d) {
  // leaves the foot as a ring (never a column of sparks at the lens)
  float r = .8 + max(uAge * uV - p.y * 3., 0.);
  float lift = uAmp * exp(-uAge * .8) / (1. + r * .05);
  float h = lift * (.1 + 1.2 * p.z * p.z) * exp(-p.y * 1.2) + .1 * sin(uAge * 3. + p.x * 40.);
  return uC + vec3(cos(p.x), 0., sin(p.x)) * r + vec3(0., h, 0.);
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float on = step(0., uAge) * smoothstep(0., 2., uAge * uV - d.x * 3.);
  // and only once it is a few metres from the lens (the camera starts at the foot)
  float far = smoothstep(4., 12., length(p - uCamPos));
  return vec4(c.rgb, c.a * on * far * exp(-uAge * .45));
}`;

/** gold sparks thrown up along the shock front, fading as it runs out */
export class Spray {
  private pts = new GlowPoints(2400, SPRAY);
  constructor() {
    const gold = mul(GOLD, 2.4), ember = mul(lin('ember'), 2.4);
    for (let i = 0; i < 2400; i++) {
      const lag = Math.pow(hash(i, 41, 2), 2);
      this.pts.point([hash(i, 41, 1) * TAU, lag, hash(i, 41, 3)], -0.03 - 0.045 * hash(i, 41, 4), hash(i, 41, 5) < 0.3 ? ember : gold, 0.6 + 0.6 * hash(i, 41, 6), [lag, 0, 0, 0]);
    }
  }
  draw(out: RT, b: Basis, o: { now: number; plant: number; foot: V3; depth?: RT }) {
    const age = o.now - o.plant;
    if (age < 0 || age > 9) return;
    this.pts.draw(out, b, { depth: o.depth, nearFade: 5, uniforms: { uC: [o.foot[0], LINE_Y, o.foot[2]], uAge: age, uV: SHOCK_V, uAmp: SHOCK_AMP } });
  }
}

/** the pale warm sky LABAS wakes up to */
export const DAWN_SKY = {
  top: mul(lin('slate'), 0.55),
  hor: add(mul(lin('ember'), 0.22), mul(lin('paper'), 0.16)),
  ground: mul(lin('ink'), 0.85),
  band: 0.9,
  warm: 0.55,
  warmCol: lin('ember'),
};

