// Paper for BULSA: folded notes and the one letter that opens, as instanced quads shaded
// like thin paper (lit on both faces, light through it from behind), painted back to front
// so they overlap properly, occluded by LOOB's depth. A sheet's inner face can carry
// handwriting, revealed row by row, that glows with the self's light. Plus the pocket itself,
// in lines: a jeans back pocket with its stitching, rivets and the yoke above it.

import type { RT } from '../../engine/gl';
import type { RGB } from '../../engine/palette';
import { camUniforms, GLSL_CAM, type Basis } from '../../engine/3d/camera';
import { fadeUniforms, GeoPass, GLSL_FADE, GLSL_OCCLUDE, type DrawOpts } from '../../engine/3d/geo';
import type { LineBatch } from '../../engine/3d/lines';
import { add, cross, dot, madd, mul, norm, sub, type V3 } from '../../engine/3d/math';

const ATTRS = [
  { name: 'aC', size: 4 },
  { name: 'aT', size: 4 },
  { name: 'aW', size: 4 },
  { name: 'aUV', size: 4 },
];
const STRIDE = 16;

const VERT = /* glsl */ `
in vec4 aC, aT, aW, aUV;
${GLSL_CAM}
${GLSL_FADE}
out vec3 vP, vN;
out vec2 vUv;
out vec3 vD;   // alpha, ink, tone
out float vZ;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vec3 p = aC.xyz + aT.xyz * (c.x * 2. - 1.) + aW.xyz * (c.y * 2. - 1.);
  vec3 v = toView(p);
  vP = p;
  vN = cross(aT.xyz, aW.xyz);
  vUv = aUV.xy + c * aUV.zw;
  vD = vec3(aC.w * depthFade(v.z), aT.w, aW.w);
  vZ = v.z;
  gl_Position = vec4(v.xy * pxPerUnit(1.) / (uRes * .5), v.z - 2. * uNear, v.z);
}`;

const FRAG = /* glsl */ `
in vec3 vP, vN;
in vec2 vUv;
in vec3 vD;
in float vZ;
uniform vec3 uCamPos;
uniform vec3 uL1, uL1C, uL2, uL2C, uKey, uKeyC, uAmb;
uniform float uAlphaOut, uReveal, uInkI;
${GLSL_OCCLUDE}

// handwriting: rows of cursive scribble, written up to uReveal (0..1 over all rows)
float ink(vec2 uv) {
  if (uv.x < .07 || uv.x > .93 || uv.y < .1 || uv.y > .9) return 0.;
  float rows = 10., ry = (.9 - uv.y) / .8 * rows, row = floor(ry), fy = fract(ry);
  float rx = (uv.x - .07) / .86;
  float lastLen = row > rows - 1.5 ? .45 : 1.;
  float rev = clamp(uReveal * rows - row, 0., 1.) * lastLen;
  if (rx > rev) return 0.;
  // words along the row
  float wx = rx * 8. + hash12(vec2(row, 3.)) * 5.;
  float wf = fract(wx), wl = .55 + .38 * hash12(vec2(row, floor(wx)));
  if (wf > wl) return 0.;
  // loops of a hand: a wobbling baseline, letter heights from noise
  float x = rx * 110. + row * 7.;
  float hgt = .16 + .2 * vnoise(vec2(x * .35, row * 3.));
  float y = .62 + .05 * sin(rx * 13. + row) - hgt * (.5 + .5 * sin(x + 1.2 * sin(x * .41 + row)));
  float edge = smoothstep(0., .04, wf) * smoothstep(wl, wl - .04, wf);
  return smoothstep(.075, .025, abs(fy - y)) * edge * smoothstep(rev, rev - .01, rx);
}

vec3 lamp(vec3 paper, vec3 n, vec3 P, vec3 C) {
  vec3 L = P - vP;
  float d2 = dot(L, L), nl = dot(n, L * inversesqrt(d2));
  // thin paper: the far face glows with what lights the near one
  return paper * C * (max(nl, 0.) + .4 * max(-nl, 0.)) / (1. + d2 * .04);
}

void main() {
  vec3 V = normalize(uCamPos - vP), n = normalize(vN);
  bool inner = dot(n, V) > 0.;
  if (!inner) n = -n;
  vec3 paper = mix(vec3(.62, .6, .55), vec3(.7, .72, .76), vD.z);
  vec3 col = paper * uAmb * (.7 + .3 * n.y);
  float kn = dot(n, uKey);
  col += paper * uKeyC * (max(kn, 0.) + .35 * max(-kn, 0.));
  col += lamp(paper, n, uL1, uL1C) + lamp(paper, n, uL2, uL2C);
  col += paper * uAmb * pow(1. - abs(dot(n, V)), 3.) * 1.5;
  if (vD.y > 0. && inner) {
    float k = ink(vUv) * vD.y;
    col = mix(col, col * .35, k) + C_GLOW * k * uInkI;
  }
  float a = vD.x * occlusion(vZ);
  if (a <= 0.) discard;
  fragColor = vec4(col * a, a * uAlphaOut);
}`;

export interface PaperLight {
  pos: V3;
  /** colour × intensity (falls off as 1 / (1 + d² · .04)) */
  col: RGB;
}

export interface PaperDraw extends DrawOpts {
  lights: [PaperLight, PaperLight];
  /** a directional key: towards the light, colour */
  key: V3;
  keyCol: RGB;
  amb: RGB;
  /** handwriting shown, 0..1, and how bright it glows */
  reveal?: number;
  inkI?: number;
}

let pass: GeoPass | null = null;

export class Paper {
  n = 0;
  private data = new Float32Array(1024 * STRIDE);
  private out = new Float32Array(1024 * STRIDE);
  private z: number[] = [];

  constructor() {
    pass ??= new GeoPass(VERT, FRAG, ATTRS);
  }

  clear() {
    this.n = 0;
    return this;
  }

  /** a quad: centre, half-extent vectors (normal = T × W is the inner face), ink, tone, uv rect */
  quad(c: V3, T: V3, W: V3, alpha: number, ink = 0, tone = 0.5, uv: [number, number, number, number] = [0, 0, 0, 0]) {
    if (alpha <= 0) return;
    if ((this.n + 1) * STRIDE > this.data.length) {
      const d = new Float32Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
      this.out = new Float32Array(d.length);
    }
    const o = this.n++ * STRIDE, D = this.data;
    D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = alpha;
    D[o + 4] = T[0]; D[o + 5] = T[1]; D[o + 6] = T[2]; D[o + 7] = ink;
    D[o + 8] = W[0]; D[o + 9] = W[1]; D[o + 10] = W[2]; D[o + 11] = tone;
    D.set(uv, o + 12);
  }

  /**
   * A note folded once along its length, flying like a paper bird: crease through `p`
   * along `fwd`, the two wings raised `beta` from flat (π/2 = shut) about `up`.
   */
  note(p: V3, fwd: V3, up: V3, len: number, wing: number, beta: number, alpha: number, tone = 0.5) {
    const S = norm(cross(fwd, up)), N = cross(S, fwd);
    const T = mul(fwd, len / 2), cb = Math.cos(beta), sb = Math.sin(beta);
    for (const k of [-1, 1]) {
      const d = madd(mul(S, k * cb), N, sb);
      const W = mul(d, wing / 2);
      // wing k = +1 keeps T × W on the same side for both halves (the inside of the fold)
      this.quad(madd(p, d, wing / 2), k > 0 ? T : mul(T, -1), W, alpha, 0, tone);
    }
  }

  /**
   * A letter-sized sheet folded in four: its right half folded over the left by `a`
   * (π = shut), then the top over the bottom by `b`. Centre of the flat sheet at `c`,
   * right/up unit vectors R, U (the written face is R × U), half size w × h.
   */
  sheet(c: V3, R: V3, U: V3, w: number, h: number, a: number, b: number, alpha: number, ink: number, tone = 0.7) {
    const N = cross(R, U);
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    // fold A about the vertical crease, fold B about the horizontal one (local x, y, z)
    const foldA = (v: V3): V3 => [v[0] * ca - v[2] * sa, v[1], v[0] * sa + v[2] * ca];
    const foldB = (v: V3): V3 => [v[0], v[1] * cb - v[2] * sb, v[1] * sb + v[2] * cb];
    const world = (v: V3): V3 => madd(madd(mul(R, v[0]), U, v[1]), N, v[2]);
    for (const right of [0, 1]) for (const top of [0, 1]) {
      const xf = (v: V3) => {
        let q = v;
        if (right) q = foldA(q);
        if (top) q = foldB(q);
        return world(q);
      };
      // a hair of thickness towards the front (the side panels fold onto), so shut panels
      // stack in the order they were folded instead of fighting
      const lift = 0.004 * (right + 2 * top) * Math.max(w, h);
      const pc = madd(xf([right ? w / 2 : -w / 2, top ? h / 2 : -h / 2, 0]), N, lift);
      this.quad(add(c, pc), xf([w / 2, 0, 0]), xf([0, h / 2, 0]), alpha, ink, tone, [right * 0.5, top * 0.5, 0.5, 0.5]);
    }
  }

  draw(out: RT, b: Basis, o: PaperDraw) {
    const n = this.n, D = this.data, O = this.out, z = this.z;
    // back to front
    const idx = Array.from({ length: n }, (_, i) => i);
    z.length = n;
    for (let i = 0; i < n; i++) z[i] = dot(sub([D[i * STRIDE], D[i * STRIDE + 1], D[i * STRIDE + 2]], b.pos), b.F);
    idx.sort((i, j) => z[j] - z[i]);
    idx.forEach((i, k) => O.set(D.subarray(i * STRIDE, (i + 1) * STRIDE), k * STRIDE));
    pass!.upload(O, n);
    const [l1, l2] = o.lights;
    pass!.draw(out, n, {
      ...camUniforms(b), ...fadeUniforms(o),
      uL1: l1.pos, uL1C: l1.col, uL2: l2.pos, uL2C: l2.col, uKey: norm(o.key), uKeyC: o.keyCol, uAmb: o.amb,
      uReveal: o.reveal ?? 0, uInkI: o.inkI ?? 0,
    }, 'over');
  }
}

// ---------------------------------------------------------------- the pocket

export interface PocketOpts {
  /** centre of the pocket's face, its right / up unit vectors (it faces R × U) */
  c: V3;
  R: V3;
  U: V3;
  /** metres across the top */
  size: number;
  /** how far the front panel bows out (the notes pushing it), metres */
  bulge: number;
  col: RGB;
  thread: RGB;
  alpha?: number;
}

/** a jeans back pocket in lines, into `L` (world-width lines) */
export function pocket(L: LineBatch, o: PocketOpts) {
  const N = cross(o.R, o.U), s = o.size / 8, a = o.alpha ?? 1;
  // front panel outline in pocket units (8 across the top, 9 tall), bowed out by the bulge
  const bow = (x: number, y: number) => o.bulge * Math.max(0, 1 - (x / 4) ** 2) * (0.35 + 0.65 * Math.min(1, (y + 4.5) / 6));
  const P = (x: number, y: number, z = 0): V3 => madd(madd(madd(o.c, o.R, x * s), o.U, y * s), N, (z + bow(x, y)) * s);
  const edge: [number, number][] = [[-4, 4.5], [4, 4.5], [3.6, -2.4], [0, -4.5], [-3.6, -2.4]];
  const along = (pts: [number, number][], step: number, closed: boolean) => {
    const out: [number, number][] = [];
    const m = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const k = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let j = 0; j < k; j++) out.push([x0 + ((x1 - x0) * j) / k, y0 + ((y1 - y0) * j) / k]);
    }
    if (!closed) out.push(pts[pts.length - 1]);
    return out;
  };
  const w = -0.05 * s;
  const outline = along(edge, 0.5, true);
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % outline.length];
    L.seg(P(x0, y0), P(x1, y1), w * 1.3, o.col, a);
  }
  // stitching: dashes just inside the edge, and the double arc across the middle
  const inset: [number, number][] = [[-3.65, 4.1], [3.65, 4.1], [3.27, -2.2], [0, -4.05], [-3.27, -2.2]];
  const dash = (pts: [number, number][], closed: boolean) => {
    const q = along(pts, 0.32, closed);
    for (let i = 0; i + 1 < q.length; i += 1) {
      const [x0, y0] = q[i], [x1, y1] = q[i + 1];
      L.seg(P(x0, y0), P(x0 + (x1 - x0) * 0.62, y0 + (y1 - y0) * 0.62), w * 0.7, o.thread, a * 0.85);
    }
  };
  dash([...inset, inset[0]], false);
  for (const dy of [0, -0.32]) {
    const arc: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const x = -3.2 + (6.4 * i) / 24;
      arc.push([x, 0.9 + dy - 1.35 * Math.abs(Math.sin((Math.PI * x) / 3.2))]);
    }
    dash(arc, false);
  }
  // rivets at the top corners
  for (const x of [-3.72, 3.72]) L.ring(P(x, 4.18), 0.2 * s, o.R, o.U, w * 0.9, o.col, a, 16);
  // the mouth: the pants behind, seen past the bowed top edge
  const back = (x: number, y: number): V3 => madd(madd(madd(o.c, o.R, x * s), o.U, y * s), N, -0.5 * s);
  L.poly([back(-4.2, 4.5), back(4.2, 4.5)], w, o.col, a * 0.7);
  // the yoke seam and waistband above, the side seams below: the rest of the jeans, fainter
  L.poly([back(-7, 7.2), back(0, 5.6), back(7, 7.2)], w, o.col, a * 0.35);
  L.poly([back(-7, 9.4), back(7, 9.4)], w, o.col, a * 0.3);
  L.poly([back(-7, 10.4), back(7, 10.4)], w, o.col, a * 0.3);
  for (const x of [-7, 7]) L.poly([back(x, 10.4), back(x * 0.96, -9)], w, o.col, a * 0.22);
  for (const x of [-2.5, 2.5]) L.poly([back(x, 11), back(x, 8.9)], w, o.col, a * 0.35);
}

/** the pocket's mouth (middle of the opening) for these options */
export const pocketMouth = (o: PocketOpts): V3 => {
  const N = cross(o.R, o.U), s = o.size / 8;
  return madd(madd(o.c, o.U, 4.5 * s), N, (o.bulge * 0.5 - 0.25) * s);
};
