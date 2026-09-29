// LOOB, the world inside: one parameterised raymarcher shared by every inner scene. A
// dark swelling sea (traced as a heightfield by secant search, no marching), islands
// floating above it (a sphere-traced SDF, one per hashed cell of a 36 m grid, plus an
// optional hero island), a sky from night to dawn, height haze, and the firefly as a light
// and a volumetric glow. Writes colour + view depth (.a) so lines, words and the `Flies`
// field sit in it correctly. Everything is a pure function of the options and t.

import { Pass, type RT } from '../../engine/gl';
import { lin } from '../../engine/palette';
import { camUniforms, type Basis } from '../../engine/3d/camera';
import type { DrawOpts } from '../../engine/3d/geo';
import { mul, norm, type V3 } from '../../engine/3d/math';
import { GlowPoints } from '../../engine/3d/points';
import { GLSL_MARCH, GLSL_SDF } from '../../engine/3d/sdf.glsl';
import { hash } from '../../engine/util';

const LOOB = /* glsl */ `
${GLSL_SDF}
uniform float uTime, uSeaY, uWave, uIsles, uIsleY, uHaze, uLum, uStars, uSunI, uDawn, uGlowI, uGlowR, uSteps;
uniform vec3 uSun, uGlow;
uniform vec4 uHero;

const vec3 SUNC = vec3(1., .52, .2);
const vec3 DEEP = vec3(.0015, .004, .008);

// ---- islands
const float CELL = 36.;
float sdIsle(vec3 p, float r, float seed) {
  float top = sdEllipsoid(p, vec3(r, r * .34, r));
  float root = sdRoundCone(p, vec3(0., -r * .05, 0.), vec3(0., -r * 1.8, 0.), r * .8, r * .05);
  float d = smin(top, root, r * .3);
  d = smax(d, p.y - r * .16, r * .12);
  // rock: two octaves of noise at the island's own scale
  vec3 q = p / r;
  d += (vnoise3(q * 2.3 + seed) - .5) * r * .24 + (vnoise3(q * 6.1 + seed * 2.) - .5) * r * .08;
  return d * .7;
}
float isles(vec3 p) {
  // only the band the islands live in; above or below it, step straight towards it
  float band = max(uIsleY - 20. - p.y, p.y - uIsleY - 12.);
  if (band > 0.) return band + .5;
  vec2 id = floor(p.xz / CELL + .5), q = p.xz - id * CELL;
  // never step across a cell border (the next cell's island is unknown here)
  vec2 cb = CELL * .5 - abs(q);
  float d = min(cb.x, cb.y) + .3;
  if (hash12(id * 1.7 + 3.1) < uIsles) {
    float r = mix(2.5, 7.5, pow(hash12(id + 11.2), 1.5));
    vec2 off = (hash22(id + 5.3) - .5) * (CELL - 2.4 * r);
    float y = uIsleY + mix(-4., 8., hash12(id + 23.9));
    vec3 lp = vec3(q.x - off.x, p.y - y, q.y - off.y);
    lp.xz *= rot(hash12(id + 7.7) * TAU);
    d = min(d, sdIsle(lp, r, hash12(id + 2.2) * 50.));
  }
  return d;
}
float map(vec3 p) {
  float d = uIsles > 0. ? isles(p) : 1e3;
  if (uHero.w > 0.) d = min(d, sdIsle(p - uHero.xyz, uHero.w, 7.));
  return d;
}
${GLSL_MARCH}

// ---- sea
float seaH(vec2 p) {
  float t = uTime;
  float h = sin(dot(p, vec2(.13, .05)) + t * .7) * .55
          + sin(dot(p, vec2(-.06, .17)) + t * .52) * .4
          + sin(dot(p, vec2(.31, -.23)) + t * 1.1) * .14;
  h += (vnoise3(vec3(p * .35, t * .3)) - .5) * .7;
  return uSeaY + h * uWave;
}
// the ray against the swell: bracket it between the crest and trough planes, then refine
float traceSea(vec3 ro, vec3 rd, float tmax) {
  float top = uSeaY + 1.3 * uWave, bot = uSeaY - 1.3 * uWave;
  float t0 = 0., t1 = tmax;
  if (ro.y > top) { if (rd.y >= 0.) return -1.; t0 = (top - ro.y) / rd.y; }
  if (rd.y < 0.) t1 = min(t1, (bot - ro.y) / rd.y);
  if (t0 > t1) return -1.;
  float h0 = ro.y + rd.y * t0 - seaH(ro.xz + rd.xz * t0);
  if (h0 < 0.) return t0;
  float h1 = ro.y + rd.y * t1 - seaH(ro.xz + rd.xz * t1);
  if (h1 > 0.) return -1.;
  float tm = t0;
  for (int i = 0; i < 10; i++) {
    tm = mix(t0, t1, h0 / (h0 - h1));
    float hm = ro.y + rd.y * tm - seaH(ro.xz + rd.xz * tm);
    if (hm < 0.) { t1 = tm; h1 = hm; } else { t0 = tm; h0 = hm; }
  }
  return tm;
}
vec3 seaNormal(vec3 p, float t) {
  float e = .03 + t * .002, h = seaH(p.xz);
  return normalize(vec3(h - seaH(p.xz + vec2(e, 0.)), e, h - seaH(p.xz + vec2(0., e))));
}

// ---- sky
vec3 horizon() { return mix(vec3(.016, .012, .028), vec3(.15, .07, .032), uDawn); }
vec3 sky(vec3 rd) {
  float h = rd.y;
  vec3 zen = mix(vec3(.0008, .0016, .006), vec3(.018, .026, .06), uDawn);
  vec3 c = mix(horizon(), zen, pow(clamp(h, 0., 1.), .45));
  vec3 sd = normalize(uSun);
  float s = max(dot(rd, sd), 0.);
  c += SUNC * uSunI * (pow(s, 5.) * .06 + pow(s, 40.) * .3 + smoothstep(.9991, .9996, s) * 6.);
  if (uStars > 0. && h > 0.) {
    vec3 g = rd * 300., id = floor(g);
    float st = hash13(id);
    if (st > .993) {
      vec3 o = vec3(hash13(id + 1.), hash13(id + 2.), hash13(id + 3.)) * .6 + .2;
      float k = smoothstep(.14, 0., length(fract(g) - o));
      c += vec3(.85, .9, 1.) * k * (st - .993) * 350. * uStars * smoothstep(0., .2, h) * (1. - uDawn * .8);
    }
  }
  return c;
}

// ---- shading
vec3 shadeIsle(vec3 p, vec3 n, vec3 rd) {
  vec3 sd = normalize(uSun);
  float sh = uSunI > 0. ? softShadow(p + n * .08, sd, .1, 60., 10.) : 0.;
  float dif = max(dot(n, sd), 0.) * sh, ao = calcAO(p, n);
  float grass = smoothstep(.55, .85, n.y);
  vec3 base = mix(vec3(.05, .042, .04), vec3(.035, .05, .03), grass);
  vec3 amb = mix(vec3(.02, .025, .05), horizon() * 1.5, .5) * (.5 + .5 * n.y);
  vec3 col = base * (SUNC * dif * 3. * uSunI + amb * ao);
  col += horizon() * pow(1. - max(dot(n, -rd), 0.), 4.) * .5 * ao;
  vec3 L = uGlow - p;
  float dl = length(L);
  col += base * C_GLOW * max(dot(n, L / dl), 0.) * uGlowI * 6. / (1. + dl * dl * .15);
  // fireflies resting in the grass
  float s = vnoise3(p * 3.1), s2 = vnoise3(p * 7.7 + 5.);
  col += C_GLOW * pow(s * s2, 6.) * 90. * uLum * grass * (.6 + .4 * sin(uTime * 3. + s * 40.));
  return col;
}
vec3 shadeSea(vec3 p, vec3 n, vec3 rd, float t) {
  float fr = .02 + .98 * pow(1. - max(dot(n, -rd), 0.), 5.);
  vec3 r = reflect(rd, n);
  r.y = abs(r.y);
  vec3 col = mix(DEEP, sky(r), fr);
  // the firefly on the water
  col += C_GLOW * pointGlow(p, r, 400., uGlow, uGlowR) * uGlowI * .02 * fr;
  vec3 L = uGlow - p;
  float dl = length(L);
  col += C_GLOW * pow(max(dot(r, L / dl), 0.), 60.) * uGlowI * 4. / (1. + dl * dl * .05);
  // bioluminescence: warm specks riding the swell
  // (two layers turned against each other, so the value-noise grid never shows)
  vec2 q = p.xz * mat2(.8, -.6, .6, .8), q2 = q * mat2(.28, -.96, .96, .28);
  float b = vnoise3(vec3(q * .45, uTime * .35)), b2 = vnoise3(vec3(q2 * 2.3, uTime * .8 + 3.));
  col += (C_GLOW * .8 + C_SEA * .4) * pow(b * b2, 5.) * 14. * uLum * exp(-t * .008);
  return col;
}

void main() {
  vec3 ro = uCamPos, rd = camRay();
  float tSea = uSeaY > -1e3 ? traceSea(ro, rd, 800.) : -1.;
  float tI = (uIsles > 0. || uHero.w > 0.) ? march(ro, rd, .05, tSea > 0. ? tSea : 800., int(uSteps)) : -1.;
  vec3 col;
  float t = -1.;
  if (tI > 0.) {
    t = tI;
    vec3 p = ro + rd * t;
    col = shadeIsle(p, calcNormal(p, .003 + .0008 * t), rd);
  } else if (tSea > 0.) {
    t = tSea;
    vec3 p = ro + rd * t;
    col = shadeSea(p, seaNormal(p, t), rd, t);
  } else col = sky(rd);
  if (t > 0.) {
    // haze, thicker low down, lit by the sun towards it
    float hk = exp(-max(ro.y + rd.y * t * .5 - uSeaY, 0.) * .04);
    float fog = 1. - exp(-t * uHaze * (.4 + .6 * hk));
    vec3 fc = horizon() * 1.2 + SUNC * uSunI * pow(max(dot(rd, normalize(uSun)), 0.), 6.) * .15;
    col = mix(col, fc, fog);
  }
  col += C_GLOW * pointGlow(ro, rd, t > 0. ? t : 800., uGlow, uGlowR) * uGlowI * .02;
  fragColor = vec4(col, t > 0. ? viewDepth(t, rd) : 1e4);
}`;

const COPY = /* glsl */ `
uniform sampler2D uSrc;
void main() { fragColor = vec4(texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).rgb, 1.); }`;

export interface LoobOpts {
  /** sea level and swell height, metres; seaY below -1000 = no sea */
  seaY: number;
  wave: number;
  /** fraction of 36 m cells holding an island (0 = none), and their mean height */
  isles: number;
  isleY: number;
  /** a hero island [x, y, z, radius]; radius 0 = none */
  hero: [number, number, number, number];
  /** fog density per metre */
  haze: number;
  /** bioluminescence on the sea, resting fireflies on the islands */
  lum: number;
  stars: number;
  /** direction towards the sun, its strength, and the sky from night (0) to dawn (1) */
  sun: V3;
  sunI: number;
  dawn: number;
  /** the firefly as a light: position, intensity, glow radius */
  glow: V3;
  glowI: number;
  glowR: number;
  /** island march steps (the quality knob) */
  steps: number;
}

export const LOOB_DEFAULTS: LoobOpts = {
  seaY: 0, wave: 0.6, isles: 0.45, isleY: 18, hero: [0, 0, 0, 0],
  haze: 0.006, lum: 0.6, stars: 1,
  sun: [0.3, 0.12, -1], sunI: 0.25, dawn: 0,
  glow: [0, 3, 0], glowI: 1, glowR: 0.08,
  steps: 110,
};

export class Loob {
  private pass = new Pass(LOOB);
  private copy = new Pass(COPY);

  /** march the world into `depth` (rgb + view depth), then copy its colour into `out` */
  draw(out: RT, depth: RT, b: Basis, t: number, o: Partial<LoobOpts> = {}) {
    const p = { ...LOOB_DEFAULTS, ...o };
    this.pass.draw(depth, {
      ...camUniforms(b),
      uTime: t, uSeaY: p.seaY, uWave: p.wave, uIsles: p.isles, uIsleY: p.isleY, uHero: p.hero,
      uHaze: p.haze, uLum: p.lum, uStars: p.stars, uSun: norm(p.sun), uSunI: p.sunI, uDawn: p.dawn,
      uGlow: p.glow, uGlowI: p.glowI, uGlowR: p.glowR, uSteps: p.steps,
    });
    this.copy.draw(out, { uSrc: depth });
  }
}

// ---------------------------------------------------------------- the firefly field

const FLIES = /* glsl */ `
uniform float uTime, uBox, uDensity, uRise;
uniform vec3 uCentre;
// d = (phase, speed, helix radius, twinkle rate); p is the base offset in a unit box
vec3 warp(vec3 p, vec4 d) {
  float t = uTime, w = t * d.y * 1.3 + d.x * 6.2831853;
  vec3 q = p * uBox;
  q.y += uRise * t * (.4 + .6 * d.y);
  q += vec3(cos(w), sin(t * .7 * d.y + d.x * 11.) * .6, sin(w)) * d.z;
  // a world-fixed field tiled every uBox metres, drawn once round the centre
  return uCentre + mod(q - uCentre + .5 * uBox, uBox) - .5 * uBox;
}
vec4 tint(vec4 c, vec3 p, vec4 d) {
  vec3 r = abs(p - uCentre) / (.5 * uBox);
  float edge = 1. - smoothstep(.65, 1., max(r.x, max(r.y, r.z)));
  float tw = .55 + .45 * sin(uTime * d.w + d.x * 40.);
  return vec4(c.rgb, c.a * edge * tw * step(fract(d.x * 7.31), uDensity));
}`;

export interface FliesDraw extends DrawOpts {
  t: number;
  /** the field is drawn in a box of `box` metres round this point (usually the camera) */
  centre: V3;
  /** 0..1 of the flies shown */
  density?: number;
  /** metres per second upward drift */
  rise?: number;
}

/**
 * Thousands of fireflies as a closed-form field: world-fixed (the camera flies through
 * them), tiled with period `box` (keep it constant within a shot), drifting on small
 * helices and rising, twinkling. Occluded by LOOB's depth when given.
 */
export class Flies {
  private pts: GlowPoints;
  constructor(public n = 6000, public box = 60, seed = 1) {
    this.pts = new GlowPoints(n, FLIES);
    const gold = lin('glow'), ember = lin('ember');
    for (let i = 0; i < n; i++) {
      const warm = hash(i, seed, 9) < 0.18;
      const size = hash(i, seed, 8) < 0.06 ? -0.09 : -0.035 - 0.03 * hash(i, seed, 7);
      this.pts.point(
        [hash(i, seed, 1) - 0.5, hash(i, seed, 2) - 0.5, hash(i, seed, 3) - 0.5],
        size,
        mul(warm ? ember : gold, 2.2),
        0.5 + hash(i, seed, 4),
        [hash(i, seed, 5), 0.3 + hash(i, seed, 6), 0.2 + 0.8 * hash(i, seed, 10), 1.5 + 4 * hash(i, seed, 11)],
      );
    }
  }
  draw(out: RT, b: Basis, o: FliesDraw) {
    const { t, centre, density, rise, ...d } = o;
    this.pts.draw(out, b, {
      nearFade: 0.4,
      ...d,
      uniforms: { uTime: t, uCentre: centre, uBox: this.box, uDensity: density ?? 1, uRise: rise ?? 0.25, ...(d.uniforms ?? {}) },
    });
  }
}

