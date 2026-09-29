// LOOB under LABAS's floor for BUO: the firefly sea, analytic (a plane a little below the
// grid, no march). Navy water, two layers of drifting specks that twinkle (filtered to their
// mean as they shrink below a pixel), a swell that glints towards the warm light and a gold
// streak where the chest light reflects in it. Only a disc round the self shows it, growing
// with each shock, its rim a line of light; painted 'over' LABAS's sky so the grid lies on it.

import { Pass, type RT } from '../../engine/gl';
import type { RGB } from '../../engine/palette';
import { camUniforms, type Basis } from '../../engine/3d/camera';
import { norm, type V3 } from '../../engine/3d/math';
import { GLSL_SDF } from '../../engine/3d/sdf.glsl';

const SEA = /* glsl */ `
${GLSL_SDF}
uniform float uTime, uY, uReveal, uLight, uSpeck;
uniform vec3 uChest, uSun, uSunCol, uRim;

// sparse glints on a jittered grid; energy-conserving blur by the pixel footprint, then the mean
float specks(vec2 q, float cell, float sig, float fw, float seed) {
  float lod = smoothstep(.25, .9, fw / cell);
  float mean = .25 * 3.14159 * sig * sig / (cell * cell);
  if (lod >= 1.) return mean;
  vec2 g = q / cell, i = floor(g), f = fract(g);
  float s = 0., s2 = sig * sig + fw * fw;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = i + vec2(x, y), o = hash22(c + seed);
    float b = hash12(c + seed + 7.1);
    vec2 d = (f - vec2(x, y) - o) * cell;
    float tw = .5 + .5 * sin(uTime * (1.5 + 3. * b) + b * 40.);
    s += tw * b * exp(-dot(d, d) / s2) * sig * sig / s2;
  }
  return mix(s, mean, lod);
}

void main() {
  vec3 ro = uCamPos, rd = camRay();
  if (rd.y > -1e-4 || uReveal <= 0.) { fragColor = vec4(0.); return; }
  float t = (uY - ro.y) / rd.y;
  vec3 p = ro + rd * t;
  vec2 q = p.xz - uChest.xz;
  float r = length(q);
  float fw = max(length(fwidth(p.xz)), 1e-4);
  float inside = smoothstep(uReveal, uReveal - 1.8, r), far = exp(-t * .012);
  // the swell: a normal from two octaves of drifting noise
  vec2 w = p.xz * .55 + vec2(uTime * .25, uTime * .1);
  float e = .05, h0 = vnoise(w) + .5 * vnoise(w * 2.3 + 4.);
  vec2 dh = vec2(vnoise(w + vec2(e, 0.)) + .5 * vnoise((w + vec2(e, 0.)) * 2.3 + 4.) - h0,
                 vnoise(w + vec2(0., e)) + .5 * vnoise((w + vec2(0., e)) * 2.3 + 4.) - h0) / e;
  float calm = 1. - smoothstep(20., 90., t);
  vec3 n = normalize(vec3(-dh.x * .12 * calm, 1., -dh.y * .12 * calm));
  vec3 rf = reflect(rd, n);
  vec3 col = vec3(.003, .006, .018) + C_SEA * .025 * (1. - far);
  // fireflies over the water, two scales, drifting
  vec2 dq = p.xz + vec2(sin(uTime * .21), cos(uTime * .17)) * .4;
  float sp = specks(dq, .9, .045, fw, 3.) + 1.8 * specks(dq * .43 + 11., 1., .03, fw * .43, 9.);
  col += C_GLOW * uLight * sp * uSpeck * 3.;
  // the warm light and the chest light glinting in the swell
  col += uSunCol * pow(max(dot(rf, uSun), 0.), 70.) * 2.5 * calm;
  vec3 L = normalize(uChest - p);
  col += C_GLOW * uLight * pow(max(dot(rf, L), 0.), 40.) * 1.2 / (1. + r * r * .02);
  col *= far;
  float a = inside * far;
  // the rim: where LABAS's floor gives way, a line of light
  vec3 rim = uRim * exp(-pow((r - uReveal) / (.02 + .0012 * t + .7 * fw), 2.)) * far;
  fragColor = vec4(col * a + rim, a);
}`;

export interface SeaOpts {
  t: number;
  /** the water plane's height */
  y: number;
  /** radius of the disc it shows through (0 = none) */
  reveal: number;
  chest: V3;
  light: number;
  /** the specks' brightness */
  speck?: number;
  sun: V3;
  sunCol: RGB;
  rim: RGB;
}

let pass: Pass | null = null;

export class Sea {
  constructor() {
    pass ??= new Pass(SEA);
  }
  draw(out: RT, b: Basis, o: SeaOpts) {
    if (o.reveal <= 0) return;
    pass!.draw(out, {
      ...camUniforms(b),
      uTime: o.t, uY: o.y, uReveal: o.reveal, uLight: o.light, uSpeck: o.speck ?? 1,
      uChest: o.chest, uSun: norm(o.sun), uSunCol: o.sunCol, uRim: o.rim,
    }, 'over');
  }
}
