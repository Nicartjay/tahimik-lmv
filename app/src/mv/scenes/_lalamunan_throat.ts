// The throat, seen from inside: a raymarched organic tube running up world −z (s = −z is
// the distance up it from the chest light). Violet-blue flesh with pale C-rings of
// cartilage, wet highlights, peristaltic swells travelling with the flow, a knot of twisted
// folds that clenches shut, and echo rings (laughter) that bulge and glow as they pass.
// Lit by the camera's own faint cool lamp, the words (cool) and, far down, the chest light
// (the only warm thing). Writes colour + view depth (.a) like LOOB so words and motes sit in
// it. The centreline is shared with the scene through `axisAt` (the same curve in GLSL).

import { Pass, type RT } from '../../engine/gl';
import { camUniforms, type Basis } from '../../engine/3d/camera';
import type { V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { GLSL_MARCH, GLSL_SDF } from '../../engine/3d/sdf.glsl';
import { hash } from '../../engine/util';

const AXIS = /* glsl */ `
vec2 axisXY(float s) { return vec2(sin(s * .045) * 4. + sin(s * .11 + 1.) * 1.2, sin(s * .06 + 2.) * 3. + sin(s * .13) * .6); }`;

/** the throat's centreline at distance s up it */
export function axisAt(s: number): V3 {
  return [Math.sin(s * 0.045) * 4 + Math.sin(s * 0.11 + 1) * 1.2, Math.sin(s * 0.06 + 2) * 3 + Math.sin(s * 0.13) * 0.6, -s];
}

/** echo rings in the wall: up to this many at once */
export const RINGS = 8;

const THROAT = /* glsl */ `
${GLSL_SDF}
${AXIS}
uniform float uTime, uFlow, uKnot, uKnotS, uSqueeze, uTwist, uChestI, uWordI, uSteps;
uniform vec3 uChest, uWord;
uniform float uRings[${RINGS * 3}]; // (s, bulge, glow) per ring

// the fine fold octave only for normals and shading, not while marching
float gFine = 0.;
float knotG(float s) { float x = (s - uKnotS) / 1.9; return exp(-x * x); }
float ringsR(float s) {
  float r = 0.;
  for (int i = 0; i < ${RINGS}; i++) {
    float a = uRings[i * 3 + 1], x = s - uRings[i * 3];
    if (a > 0. && abs(x) < 2.6) r += a * exp(-x * x * 1.6);
  }
  return r;
}
float ringsGlow(float s) {
  float g = 0.;
  for (int i = 0; i < ${RINGS}; i++) {
    float x = s - uRings[i * 3];
    if (abs(x) < 1.4) g += uRings[i * 3 + 2] * exp(-x * x * 6.);
  }
  return g;
}
// wall radius at (s, th); rib = how much cartilage is here
float wallR(float s, float th, out float rib) {
  float R = 2.4 * (1. - uSqueeze * .38 * smoothstep(uKnotS - 45., uKnotS - 3., s));
  // C-rings of cartilage, open along the top
  rib = pow(.5 + .5 * cos(TAU * s / 1.3), 8.) * smoothstep(.35, -.25, sin(th));
  R -= .18 * rib;
  // peristalsis: slow swells travelling with the flow
  R += .22 * sin(s * .33 - uFlow);
  // wet folds: warped waves whole in th (no seam), cheap enough to march; the fine octave
  // is noise on the tube's own surface (cos th, sin th, s)
  float z = s - uFlow * .6;
  R += .2 * sin(3. * th + z * .55 + 1.4 * sin(z * .23 + 2. * th))
     + .14 * sin(5. * th - z * .8 + 1.1 * sin(z * .37 - th) + 2.)
     + .1 * sin(2. * th + z * 1.3 + 4.);
  if (gFine > 0.) R += (vnoise3(vec3(cos(th) * 5.5, sin(th) * 5.5, z * 1.65) + 9.) - .5) * .22;
  // the knot: twisted folds, clenching shut as uKnot → 1
  float x = (s - uKnotS) / 1.9;
  if (abs(x) < 3.2) {
    float fold = .5 + .5 * sin(th * 7. + x * 3. + uTwist);
    R = mix(R, mix(1.15 + .35 * fold, -.3 + .45 * fold, uKnot), exp(-x * x));
  }
  return R + ringsR(s) * .4;
}
float map(vec3 p) {
  float s = -p.z, rib;
  vec2 q = p.xy - axisXY(s);
  return (wallR(s, atan(q.y, q.x), rib) - length(q)) * .7;
}
${GLSL_MARCH}

// sphere tracing a tube is slow along its axis (the wall is near but far ahead), so step by
// the radial gap over how fast the ray can close it: its speed across the axis plus L times
// its speed along it (L bounds the wall's slope in s); an overshoot is bisected back
vec2 axisD(float s) { return vec2(cos(s * .045) * .18 + cos(s * .11 + 1.) * .132, cos(s * .06 + 2.) * .18 + cos(s * .13) * .078); }
float marchTube(vec3 ro, vec3 rd, float tmax, int steps) {
  float t = .02, tp = t, cone = pixelCone();
  for (int i = 0; i < 256; i++) {
    if (i >= steps) break;
    float d = map(ro + rd * t) / .7;
    if (d < max(1e-4, cone * t)) {
      if (d < -.02) for (int k = 0; k < 6; k++) { float m = (tp + t) * .5; if (map(ro + rd * m) < 0.) t = m; else tp = m; }
      return t;
    }
    float s = -(ro.z + rd.z * t);
    vec3 T = normalize(vec3(axisD(s), -1.));
    float ca = abs(dot(rd, T)), sa = sqrt(max(1. - ca * ca, 0.));
    tp = t;
    t += d / (sa + .55 * ca + .05) * .85;
    if (t > tmax) break;
  }
  return -1.;
}

vec3 shade(vec3 p, vec3 n, vec3 rd) {
  float s = -p.z, rib;
  vec2 q = p.xy - axisXY(s);
  wallR(s, atan(q.y, q.x), rib);
  float ao = clamp(map(p + n * .4) / .28, 0., 1.);
  vec3 base = mix(vec3(.075, .03, .075), vec3(.1, .09, .13), rib * .7);
  base = mix(base, vec3(.13, .02, .06), knotG(s) * uKnot * .6);
  vec3 V = -rd, col = vec3(0.);
  // the camera's lamp: faint, cool, wet highlights
  vec3 L = uCamPos + uCamU * .4 - p;
  float d = length(L);
  L /= d;
  float fall = 1. / (1. + d * d * .02);
  float wet = .4 + .6 * vnoise3(p * 4.);
  col += base * vec3(.35, .45, .9) * max(dot(n, L), 0.) * 1.3 * fall;
  col += vec3(.45, .55, 1.) * pow(max(dot(n, normalize(L + V)), 0.), 60.) * .45 * fall * wet;
  // the words: cool light carried up the throat
  if (uWordI > 0.) {
    vec3 Lw = uWord - p;
    float dw = length(Lw);
    Lw /= dw;
    float fw = uWordI / (1. + dw * dw * .35);
    col += base * vec3(.7, .85, 1.3) * max(dot(n, Lw), 0.) * 4.5 * fw;
    col += vec3(.7, .85, 1.) * pow(max(dot(n, normalize(Lw + V)), 0.), 40.) * .9 * fw * wet;
  }
  // the chest light, far down: the only warmth
  vec3 Lh = uChest - p;
  float dh = length(Lh);
  col += base * C_GLOW * max(dot(n, Lh / dh), 0.) * uChestI * 6. / (1. + dh * dh * .1);
  col += vec3(.02, .025, .07) * pow(1. - max(dot(n, V), 0.), 3.);
  col *= .3 + .7 * ao;
  // echo rings glow in the wall as they pass
  col += C_SEA * ringsGlow(s) * 1.4 * (.5 + .5 * ao);
  return col;
}

void main() {
  vec3 ro = uCamPos, rd = camRay();
  float t = marchTube(ro, rd, 110., int(uSteps));
  gFine = 1.;
  vec3 fogC = vec3(.003, .0022, .007);
  vec3 col = fogC;
  if (t > 0.) {
    vec3 p = ro + rd * t;
    col = mix(shade(p, calcNormal(p, .004 + .001 * t), rd), fogC, 1. - exp(-t * .028));
  }
  float tm = t > 0. ? t : 110.;
  col += C_GLOW * pointGlow(ro, rd, tm, uChest, .12) * uChestI * .012;
  col += vec3(.6, .75, 1.) * pointGlow(ro, rd, tm, uWord, .3) * uWordI * .01;
  fragColor = vec4(col, t > 0. ? viewDepth(t, rd) : 1e4);
}`;

const COPY = /* glsl */ `
uniform sampler2D uSrc;
void main() { fragColor = vec4(texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).rgb, 1.); }`;

export interface ThroatOpts {
  t: number;
  /** peristalsis phase (radians, grows while the throat swallows, falls when it reverses) */
  flow: number;
  /** the knot: where (s), how shut (0..1), its folds' twist */
  knot: number;
  knotS: number;
  twist: number;
  /** the whole throat narrowing towards the knot, 0..1 */
  squeeze: number;
  chest: V3;
  chestI: number;
  word: V3;
  wordI: number;
  /** [s, bulge, glow] per echo ring (at most RINGS) */
  rings: [number, number, number][];
  steps?: number;
}

let pass: Pass | null = null, copy: Pass | null = null;

export class Throat {
  constructor() {
    pass ??= new Pass(THROAT);
    copy ??= new Pass(COPY);
  }
  /** march the throat into `depth` (rgb + view depth), then copy its colour into `out` */
  draw(out: RT, depth: RT, b: Basis, o: ThroatOpts) {
    const R = new Array<number>(RINGS * 3).fill(0);
    o.rings.slice(0, RINGS).forEach((r, i) => R.splice(i * 3, 3, ...r));
    pass!.draw(depth, {
      ...camUniforms(b),
      uTime: o.t, uFlow: o.flow, uKnot: o.knot, uKnotS: o.knotS, uTwist: o.twist, uSqueeze: o.squeeze,
      uChest: o.chest, uChestI: o.chestI, uWord: o.word, uWordI: o.wordI, uRings: R, uSteps: o.steps ?? 64,
    });
    copy!.draw(out, { uSrc: depth });
  }
}

// ---------------------------------------------------------------- motes in the throat

const MOTES = /* glsl */ `
${AXIS}
uniform float uCamS, uDrift, uTime;
// p = (s cell 0..1, angle 0..1, radius² 0..1), d.x = spin
vec3 warp(vec3 p, vec4 d) {
  float s = uCamS + mod(p.x * 50. + uDrift - uCamS + 25., 50.) - 25.;
  float th = p.y * TAU + uTime * (d.x - .5) * .7;
  float r = sqrt(p.z) * 1.6;
  return vec3(axisXY(s) + vec2(cos(th), sin(th)) * r, -s);
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  return vec4(c.rgb, c.a * (1. - smoothstep(17., 24., abs(-p.z - uCamS))) * (.6 + .4 * sin(uTime * d.y + d.z * 30.)));
}`;

/** specks suspended in the throat, carried by the flow: the speed cue */
export class Motes {
  private pts: GlowPoints;
  constructor(n = 1400, seed = 3) {
    this.pts = new GlowPoints(n, MOTES);
    for (let i = 0; i < n; i++) {
      const big = hash(i, seed, 7) < 0.05;
      this.pts.point(
        [hash(i, seed, 1), hash(i, seed, 2), hash(i, seed, 3)],
        big ? -0.03 : -0.01 - 0.008 * hash(i, seed, 4),
        [0.45, 0.58, 0.95],
        big ? 0.5 : 0.35 + 0.4 * hash(i, seed, 5),
        [hash(i, seed, 6), 2 + 5 * hash(i, seed, 8), hash(i, seed, 9), 0],
      );
    }
  }
  draw(out: RT, b: Basis, t: number, camS: number, drift: number, depth: RT) {
    this.pts.draw(out, b, { depth, nearFade: 0.3, uniforms: { uCamS: camS, uDrift: drift, uTime: t } });
  }
}
