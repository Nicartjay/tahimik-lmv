// ENTABLADO's spotlights: up to six volumetric cones in one additive fullscreen pass. Each
// ray is clipped against each cone analytically (the quadratic, its front nappe, the
// throw length and the plane the beam lands on), then the slab inside is integrated in a
// few jittered steps through a soft radial profile and drifting dust. Where a beam lands
// it leaves a pool on the stage or the floor, and each lamp flares at its apex. Cool light
// only: the one warm light in LABAS belongs to the self.

import { Pass, type RT } from '../../engine/gl';
import type { RGB } from '../../engine/palette';
import { camUniforms, type Basis } from '../../engine/3d/camera';
import { norm, sub, type V3 } from '../../engine/3d/math';
import { GLSL_SDF } from '../../engine/3d/sdf.glsl';

export const MAX_BEAMS = 6;
/** floats per beam: apex xyz, axis xyz, cos(half-angle), intensity, throw, landing y, colour rgb, pool footprint (1 = stage only) */
const F = 14;

const BEAMS = /* glsl */ `
${GLSL_SDF}
uniform float uB[${MAX_BEAMS * F}];
uniform float uN, uTime, uSeed, uDust, uFlare;
uniform vec4 uStage; // footprint x half-width, z0, z1, top y

vec3 bv(int i, int o) { return vec3(uB[i * ${F} + o], uB[i * ${F} + o + 1], uB[i * ${F} + o + 2]); }

// [t0, t1] of the ray inside the cone's front nappe (t1 < t0: miss)
vec2 coneHit(vec3 ro, vec3 rd, vec3 A, vec3 D, float c) {
  vec3 co = ro - A;
  float dd = dot(rd, D), cd = dot(co, D), c2 = c * c;
  float a = dd * dd - c2, b = 2. * (dd * cd - dot(rd, co) * c2), k = cd * cd - dot(co, co) * c2;
  float disc = b * b - 4. * a * k;
  bool inside = k > 0. && cd > 0.;
  if (disc < 0.) return inside ? vec2(0., 1e4) : vec2(1., 0.);
  float sq = sqrt(disc);
  float r1 = (-b - sq) / (2. * a), r2 = (-b + sq) / (2. * a);
  float t1 = min(r1, r2), t2 = max(r1, r2);
  if (a < 0.) {
    // inside between the roots: keep it only if that's the front nappe
    float tm = .5 * (t1 + t2);
    return cd + tm * dd > 0. ? vec2(t1, t2) : vec2(1., 0.);
  }
  // inside outside the roots: the front nappe is the side the ray runs towards the opening
  return dd > 0. ? vec2(t2, 1e4) : vec2(-1e4, t1);
}

void main() {
  vec3 ro = uCamPos, rd = camRay();
  vec3 col = vec3(0.);
  float jit = hash13(vec3(gl_FragCoord.xy, uSeed));
  for (int i = 0; i < ${MAX_BEAMS}; i++) {
    if (float(i) >= uN) break;
    vec3 A = bv(i, 0), D = bv(i, 3), C = bv(i, 10);
    float c = uB[i * ${F} + 6], I = uB[i * ${F} + 7], L = uB[i * ${F} + 8], yl = uB[i * ${F} + 9], stageOnly = uB[i * ${F} + 13];
    if (I <= 0.) continue;
    float tanA = sqrt(max(1. - c * c, 1e-6)) / c;
    // only above the landing plane
    vec2 h = coneHit(ro, rd, A, D, c);
    float t0 = max(h.x, 0.), t1 = h.y;
    float tl = abs(rd.y) > 1e-5 ? (yl - ro.y) / rd.y : -1.;
    bool above = ro.y > yl;
    if (abs(rd.y) <= 1e-5) { if (!above) t1 = -1.; }
    else if (rd.y > 0.) t0 = max(t0, tl);
    else t1 = min(t1, tl);
    // the throw: along the axis s = dot(p - A, D) in [0, L]
    float cd = dot(ro - A, D), dd = dot(rd, D);
    if (abs(dd) > 1e-5) {
      float ta = (0. - cd) / dd, tb = (L - cd) / dd;
      t0 = max(t0, min(ta, tb));
      t1 = min(t1, max(ta, tb));
    } else if (cd < 0. || cd > L) t1 = -1.;
    t1 = min(t1, 200.);
    if (t1 > t0) {
      float dt = (t1 - t0) / 6., acc = 0.;
      for (int k = 0; k < 6; k++) {
        vec3 p = ro + rd * (t0 + (float(k) + jit) * dt);
        vec3 q = p - A;
        float s = dot(q, D), r = length(q - D * s) / max(s * tanA, 1e-3);
        float prof = (1. - smoothstep(.55, 1., r)) * (.35 + .65 * exp(-r * r * 5.));
        float dust = 1. - uDust + uDust * (vnoise3(p * 1.7 + vec3(.13, .3, .07) * uTime) * .7 + vnoise3(p * 5.3 - vec3(.2, .5, .1) * uTime) * .6);
        // a gentle fall-off down the throw, and dimmer right at the lamp
        acc += prof * dust * smoothstep(0., 1.2, s) / (1. + s * s * .004);
      }
      col += C * I * acc * dt;
    }
    // the pool where it lands
    if (above && rd.y < 0.) {
      vec3 p = ro + rd * tl, q = p - A;
      float s = dot(q, D), r = length(q - D * s) / max(s * tanA, 1e-3);
      bool onStage = abs(p.x) < uStage.x && p.z > uStage.y && p.z < uStage.z;
      if (s > 0. && s < L && (stageOnly < .5 || onStage))
        col += C * I * (1. - smoothstep(.75, 1., r)) * (.6 + .4 * exp(-r * r * 3.)) * 1.05;
    }
    // the lamp itself, if it looks our way
    vec3 v = A - ro;
    float tv = dot(v, rd);
    if (tv > 0.) {
      float d = length(v - rd * tv), facing = max(dot(-normalize(v), D), 0.);
      col += C * I * uFlare * (exp(-d * d / .004) * 6. + exp(-d * d / .1) * .5) * pow(facing, 6.);
    }
  }
  fragColor = vec4(col, 0.);
}`;

export interface Beam {
  apex: V3;
  /** where it points (a world point) */
  at: V3;
  /** half-angle, radians */
  half: number;
  /** brightness (0 = off) */
  I: number;
  col: RGB;
  /** throw in metres (default: to `at` and a bit), landing plane y (default at[1]) */
  throw?: number;
  land?: number;
  /** the pool only on the stage footprint */
  stageOnly?: boolean;
}

let pass: Pass | null = null;

export interface BeamsDraw {
  t: number;
  /** frame seed for the step jitter */
  seed: number;
  /** stage footprint: x half-width, z range, top */
  stage: [number, number, number, number];
  dust?: number;
  flare?: number;
}

export class Beams {
  private buf = new Float32Array(MAX_BEAMS * F);
  constructor() {
    pass ??= new Pass(BEAMS);
  }
  draw(out: RT, b: Basis, beams: Beam[], o: BeamsDraw) {
    const n = Math.min(beams.length, MAX_BEAMS);
    const B = this.buf;
    B.fill(0);
    let any = false;
    for (let i = 0; i < n; i++) {
      const m = beams[i], D = norm(sub(m.at, m.apex)), o0 = i * F;
      const dist = Math.hypot(m.at[0] - m.apex[0], m.at[1] - m.apex[1], m.at[2] - m.apex[2]);
      B.set([...m.apex, ...D, Math.cos(m.half), m.I, m.throw ?? dist * 1.3, m.land ?? m.at[1], ...m.col, m.stageOnly ? 1 : 0], o0);
      any ||= m.I > 0;
    }
    if (!any) return;
    pass!.draw(out, {
      ...camUniforms(b),
      uB: Array.from(B), uN: n, uTime: o.t, uSeed: o.seed, uDust: o.dust ?? 0.6, uFlare: o.flare ?? 1, uStage: o.stage,
    }, 'add');
  }
}
