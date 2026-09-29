// SIMULA's private pieces: the dark before anything (a haze of dust lit only by the one
// firefly), the motes the chase tears through, and the reveal front that draws LABAS
// into being outward from the self when the camera crashes out.

import { Pass, type RT } from '../../engine/gl';
import { lin } from '../../engine/palette';
import { camUniforms, type Basis } from '../../engine/3d/camera';
import type { DrawOpts } from '../../engine/3d/geo';
import { mul, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { GLSL_SDF } from '../../engine/3d/sdf.glsl';
import { hash } from '../../engine/util';

// ---------------------------------------------------------------- the void

// A near-black volume, marched in a few geometric slices: world-fixed noise dust that only
// the firefly lights (inverse-square), plus the firefly's own in-scatter.
const VOID = /* glsl */ `
${GLSL_SDF}
uniform vec3 uFly;
uniform float uI, uA, uT;
void main() {
  vec3 ro = uCamPos, rd = camRay();
  vec3 col = vec3(.0004, .0006, .0012) * (.6 + .4 * smoothstep(-.6, .6, rd.y));
  float t = .05;
  vec3 acc = vec3(0.);
  for (int i = 0; i < 10; i++) {
    float dt = t * .55;
    vec3 p = ro + rd * (t + dt * .5);
    float n = vnoise3(p * 1.9 + vec3(0., uT * .04, 0.)) * .6 + vnoise3(p * 4.7 - uT * .03) * .4;
    float dens = smoothstep(.5, .92, n) * dt;
    vec3 L = p - uFly;
    acc += dens * (vec3(.0006, .001, .0022) + (C_GLOW * .8 + C_EMBER * .2) * uI * .009 / (dot(L, L) * 3. + .003));
    t += dt;
  }
  col += acc;
  col += (C_GLOW * .8 + C_EMBER * .2) * pointGlow(ro, rd, 60., uFly, .012) * uI * .00022;
  fragColor = vec4(col * uA, 0.);
}`;

let voidPass: Pass | null = null;

export function drawVoid(out: RT, b: Basis, o: { fly: V3; light: number; alpha: number; t: number }) {
  voidPass ??= new Pass(VOID);
  voidPass.draw(out, { ...camUniforms(b), uFly: o.fly, uI: o.light, uA: o.alpha, uT: o.t }, 'add');
}

// ---------------------------------------------------------------- dust

// d = (phase, drift, -, twinkle). World-fixed motes tiled every uBox metres, drawn once
// round uCentre; cool and faint in the dark, gold where the firefly is near.
const DUST = /* glsl */ `
uniform float uTime, uBox, uDensity, uI;
uniform vec3 uCentre, uFly;
vec3 warp(vec3 p, vec4 d) {
  vec3 q = p * uBox;
  float w = uTime * (.15 + .25 * d.y) + d.x * 6.2831853;
  q += vec3(sin(w), sin(w * .71 + d.x * 9.), cos(w * 1.27)) * .012 * uBox;
  return uCentre + mod(q - uCentre + .5 * uBox, uBox) - .5 * uBox;
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  vec3 r = abs(p - uCentre) / (.5 * uBox);
  float edge = 1. - smoothstep(.55, 1., max(r.x, max(r.y, r.z)));
  vec3 L = p - uFly;
  float lit = uI / (1. + dot(L, L) * 30.);
  float tw = .65 + .35 * sin(uTime * d.w + d.x * 40.);
  vec3 col = c.rgb * .06 + (C_GLOW * .85 + C_EMBER * .15) * lit * 1.4;
  return vec4(col, c.a * edge * tw * step(fract(d.x * 7.31), uDensity));
}`;

export interface DustDraw extends DrawOpts {
  t: number;
  centre: V3;
  fly: V3;
  light: number;
  density?: number;
}

/** motes of a few mm, world-fixed so the camera tears through them, lit by the firefly */
export class Dust {
  private pts: GlowPoints;
  constructor(public n = 14000, public box = 3.2, seed = 3) {
    this.pts = new GlowPoints(n, DUST);
    const cool = mul(lin('ash'), 1), paper = lin('paper');
    for (let i = 0; i < n; i++) {
      const big = hash(i, seed, 8) < 0.04;
      this.pts.point(
        [hash(i, seed, 1) - 0.5, hash(i, seed, 2) - 0.5, hash(i, seed, 3) - 0.5],
        big ? -0.0045 : -0.0011 - 0.0016 * hash(i, seed, 7),
        hash(i, seed, 9) < 0.3 ? paper : cool,
        (big ? 0.5 : 1) * (0.4 + hash(i, seed, 4)),
        [hash(i, seed, 5), hash(i, seed, 6), 0, 1.2 + 3 * hash(i, seed, 11)],
      );
    }
  }
  draw(out: RT, b: Basis, o: DustDraw) {
    const { t, centre, fly, light, density, ...d } = o;
    this.pts.draw(out, b, {
      nearFade: 0.06,
      ...d,
      uniforms: { uTime: t, uCentre: centre, uFly: fly, uI: light, uBox: this.box, uDensity: density ?? 1 },
    });
  }
}

// ---------------------------------------------------------------- the reveal front

/**
 * Tint for LABAS lines: nothing exists beyond a front leaving uO at uRing metres, a hot
 * cool band rides the front, and everything behind it settles to its ink. uRingW is the
 * band width. Append to a batch's GLSL (FIGURE_GLSL has no tint of its own).
 */
export const REVEAL_TINT = /* glsl */ `
uniform vec3 uO;
uniform float uRing, uRingW, uRingI;
vec4 tint(vec4 c, vec3 p, vec4 d) {
  float x = uRing - length(p.xz - uO.xz);
  float on = smoothstep(-uRingW * .3, uRingW * .3, x);
  float band = exp(-x * x / (uRingW * uRingW)) * uRingI;
  return vec4(c.rgb * (1. + band * 6.), c.a * on);
}`;

export const revealUniforms = (o: V3, ring: number, w: number, I: number) => ({ uO: o, uRing: ring, uRingW: w, uRingI: I });
