// 3D line segments, one instanced quad each, anti-aliased as a capsule in screen space
// (after p(doom)'s LineBatch; see THIRD_PARTY_NOTICES.md). Widths are logical px (> 0)
// or world units (< 0); lines thinner than 0.7 physical px keep their width's worth of
// light instead of shimmering. Colours are linear HDR: > 1 blooms.
//
// Caps: 'butt' (default) filters each segment as a box along its length too, so the
// segments of a polyline tile exactly and additive light never doubles at the joints.
// 'round' draws capsules, for isolated strokes or 'max'/'over' blending.
//
// A batch can be built once and drawn every frame (static geometry), animated on the GPU
// by a `warp(p, data, end)` GLSL hook and tinted by `tint(col, p, data)`, with any extra
// uniforms the hook declares. `data` is a free vec4 per segment (ids, phases, …).

import type { RGB } from '../palette';
import type { RT } from '../gl';
import { camUniforms, GLSL_CAM, type Basis } from './camera';
import { fadeUniforms, GeoPass, GLSL_FADE, GLSL_OCCLUDE, type DrawOpts, type GeoBlend } from './geo';
import type { V3 } from './math';

const ATTRS = [
  { name: 'aA', size: 4 },
  { name: 'aB', size: 4 },
  { name: 'aCol', size: 4 },
  { name: 'aData', size: 4 },
];
const STRIDE = 16;

const hooks = (glsl: string) =>
  glsl +
  (/\bvec3\s+warp\s*\(/.test(glsl) ? '' : '\nvec3 warp(vec3 p, vec4 d, float end) { return p; }') +
  (/\bvec4\s+tint\s*\(/.test(glsl) ? '' : '\nvec4 tint(vec4 c, vec3 p, vec4 d) { return c; }');

const VERT = (glsl: string) => /* glsl */ `
in vec4 aA, aB, aCol, aData;
${GLSL_CAM}
${GLSL_FADE}
${hooks(glsl)}
flat out vec4 vSeg;   // screen-space ends, physical px
flat out vec2 vRad;   // radius at each end, physical px (≥ .35)
flat out vec2 vThin;  // hairline gain at each end
out vec4 vCol;
out float vZ;
void main() {
  vec3 pa = warp(aA.xyz, aData, 0.), pb = warp(aB.xyz, aData, 1.);
  vec3 va = toView(pa), vb = toView(pb);
  if (va.z < uNear && vb.z < uNear) { gl_Position = vec4(2., 2., 2., 1.); return; }
  if (va.z < uNear) va = mix(va, vb, (uNear - va.z) / (vb.z - va.z));
  if (vb.z < uNear) vb = mix(vb, va, (uNear - vb.z) / (va.z - vb.z));
  vec2 sa = viewToScreen(va), sb = viewToScreen(vb);
  float s = uRes.y / 1080.;
  float ra = .5 * (aA.w >= 0. ? aA.w * s : -aA.w * pxPerUnit(va.z));
  float rb = .5 * (aB.w >= 0. ? aB.w * s : -aB.w * pxPerUnit(vb.z));
  vThin = vec2(min(ra / .35, 1.), min(rb / .35, 1.));
  ra = max(ra, .35); rb = max(rb, .35);
  vSeg = vec4(sa, sb);
  vRad = vec2(ra, rb);
  int end = gl_VertexID >> 1;
  float side = float(gl_VertexID & 1) * 2. - 1.;
  vec2 d = sb - sa;
  float L = length(d);
  d = L > 1e-4 ? d / L : vec2(1., 0.);
  vec2 n = vec2(-d.y, d.x);
  float pa1 = ra + 1., pb1 = rb + 1.;
  vec2 p = end == 0 ? sa - d * pa1 + n * side * pa1 : sb + d * pb1 + n * side * pb1;
  vec4 c = tint(aCol, end == 0 ? pa : pb, aData);
  vec3 v = end == 0 ? va : vb;
  float f = depthFade(v.z);
  vCol = vec4(c.rgb * c.a * f, c.a * f);
  vZ = v.z;
  gl_Position = vec4(p / uRes * 2. - 1., 0., 1.);
}`;

const FRAG = /* glsl */ `
flat in vec4 vSeg;
flat in vec2 vRad, vThin;
in vec4 vCol;
in float vZ;
uniform float uAlphaOut, uRound;
${GLSL_OCCLUDE}
void main() {
  vec2 p = gl_FragCoord.xy, a = vSeg.xy, ba = vSeg.zw - vSeg.xy;
  float L2 = max(dot(ba, ba), 1e-6), s = dot(p - a, ba) / L2;
  float h = clamp(s, 0., 1.);
  float d, along = 1.;
  if (uRound > .5) d = length(p - a - ba * h);
  else {
    // butt ends: box-filter coverage along the axis as well, so neighbours sum to 1
    float L = sqrt(L2);
    d = abs(dot(p - a, vec2(-ba.y, ba.x)) / L);
    along = clamp(min(s * L + .5, L) - max(s * L - .5, 0.), 0., 1.);
  }
  float r = mix(vRad.x, vRad.y, h);
  // exact coverage of a 1-px box filter across a line of half-width r
  float cov = clamp(min(d + r, .5) - max(d - r, -.5), 0., 1.) * along * mix(vThin.x, vThin.y, h);
  cov *= occlusion(vZ);
  if (cov <= 0.) discard;
  fragColor = vec4(vCol.rgb * cov, vCol.a * cov * uAlphaOut);
}`;

export class LineBatch {
  n = 0;
  private data: Float32Array;
  private pass: GeoPass;
  private dirty = true;

  constructor(
    capacity = 16384,
    glsl = '',
    public blend: GeoBlend = 'add',
    public caps: 'butt' | 'round' = 'butt',
  ) {
    this.data = new Float32Array(capacity * STRIDE);
    this.pass = new GeoPass(VERT(glsl), FRAG, ATTRS);
  }

  clear() {
    this.n = 0;
    this.dirty = true;
    return this;
  }

  /** segment with width w at a and wb at b (> 0 logical px, < 0 world units) */
  seg(a: V3, b: V3, w: number, col: RGB, alpha = 1, data?: ArrayLike<number>, wb = w) {
    if ((this.n + 1) * STRIDE > this.data.length) {
      const d = new Float32Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
    }
    const o = this.n++ * STRIDE, D = this.data;
    D[o] = a[0]; D[o + 1] = a[1]; D[o + 2] = a[2]; D[o + 3] = w;
    D[o + 4] = b[0]; D[o + 5] = b[1]; D[o + 6] = b[2]; D[o + 7] = wb;
    D[o + 8] = col[0]; D[o + 9] = col[1]; D[o + 10] = col[2]; D[o + 11] = alpha;
    D[o + 12] = data?.[0] ?? 0; D[o + 13] = data?.[1] ?? 0; D[o + 14] = data?.[2] ?? 0; D[o + 15] = data?.[3] ?? 0;
    this.dirty = true;
    return this;
  }

  poly(pts: V3[], w: number, col: RGB, alpha = 1, closed = false, data?: ArrayLike<number>) {
    for (let i = 1; i < pts.length; i++) this.seg(pts[i - 1], pts[i], w, col, alpha, data);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0], w, col, alpha, data);
    return this;
  }

  /** circle of radius r round c in the plane spanned by unit vectors u, v */
  ring(c: V3, r: number, u: V3, v: V3, w: number, col: RGB, alpha = 1, n = 48, data?: ArrayLike<number>) {
    let prev: V3 | null = null;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      const p: V3 = [c[0] + u[0] * ca + v[0] * sa, c[1] + u[1] * ca + v[1] * sa, c[2] + u[2] * ca + v[2] * sa];
      if (prev) this.seg(prev, p, w, col, alpha, data);
      prev = p;
    }
    return this;
  }

  draw(target: RT, b: Basis, o: DrawOpts = {}) {
    if (this.dirty) {
      this.pass.upload(this.data, this.n);
      this.dirty = false;
    }
    this.pass.draw(
      target,
      this.n,
      { ...camUniforms(b), ...fadeUniforms(o), uRound: this.caps === 'round' ? 1 : 0, ...(o.uniforms ?? {}) },
      o.blend ?? this.blend,
    );
  }
}
