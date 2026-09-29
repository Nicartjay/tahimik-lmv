// Soft glowing points (fireflies, dust, embers): one Gaussian sprite per instance, sized
// in logical px (> 0) or world units (< 0, perspective). Sprites below ~0.8 physical px
// keep their size and trade it for intensity, so distant points don't sparkle. Same
// warp/tint hooks and fog/near-fade/occlusion as LineBatch. Additive by default.

import type { RGB } from '../palette';
import type { RT } from '../gl';
import { camUniforms, GLSL_CAM, type Basis } from './camera';
import { fadeUniforms, GeoPass, GLSL_FADE, GLSL_OCCLUDE, type DrawOpts, type GeoBlend } from './geo';
import type { V3 } from './math';

const ATTRS = [
  { name: 'aP', size: 4 },
  { name: 'aCol', size: 4 },
  { name: 'aData', size: 4 },
];
const STRIDE = 12;

const hooks = (glsl: string) =>
  glsl +
  (/\bvec3\s+warp\s*\(/.test(glsl) ? '' : '\nvec3 warp(vec3 p, vec4 d) { return p; }') +
  (/\bvec4\s+tint\s*\(/.test(glsl) ? '' : '\nvec4 tint(vec4 c, vec3 p, vec4 d) { return c; }');

const VERT = (glsl: string) => /* glsl */ `
in vec4 aP, aCol, aData;
${GLSL_CAM}
${GLSL_FADE}
${hooks(glsl)}
out vec2 vQ;      // sprite coordinate in σ units
out vec3 vCol;
out float vZ;
void main() {
  vec3 p = warp(aP.xyz, aData);
  vec3 v = toView(p);
  vec4 c = tint(aCol, p, aData);
  if (v.z < uNear || c.a <= 0.) { gl_Position = vec4(2., 2., 2., 1.); return; }
  float sig = aP.w >= 0. ? aP.w * uRes.y / 1080. : -aP.w * pxPerUnit(v.z);
  float gain = c.a * depthFade(v.z);
  if (sig < .8) { gain *= sig * sig / .64; sig = .8; }
  vec2 corner = vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2. - 1.;
  vQ = corner * 3.;
  vCol = c.rgb * gain;
  vZ = v.z;
  vec2 s = viewToScreen(v) + vQ * sig;
  gl_Position = vec4(s / uRes * 2. - 1., 0., 1.);
}`;

const FRAG = /* glsl */ `
in vec2 vQ;
in vec3 vCol;
in float vZ;
uniform float uAlphaOut;
${GLSL_OCCLUDE}
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 9.) discard;
  float g = exp(-.5 * r2) * (1. - r2 / 9.) * occlusion(vZ);
  fragColor = vec4(vCol * g, g * uAlphaOut);
}`;

export class GlowPoints {
  n = 0;
  private data: Float32Array;
  private pass: GeoPass;
  private dirty = true;

  constructor(
    capacity = 4096,
    glsl = '',
    public blend: GeoBlend = 'add',
  ) {
    this.data = new Float32Array(capacity * STRIDE);
    this.pass = new GeoPass(VERT(glsl), FRAG, ATTRS);
  }

  clear() {
    this.n = 0;
    this.dirty = true;
    return this;
  }

  /** σ = size: > 0 logical px, < 0 world units. col is linear HDR; `a` scales it */
  point(p: V3, size: number, col: RGB, a = 1, data?: ArrayLike<number>) {
    if ((this.n + 1) * STRIDE > this.data.length) {
      const d = new Float32Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
    }
    const o = this.n++ * STRIDE, D = this.data;
    D[o] = p[0]; D[o + 1] = p[1]; D[o + 2] = p[2]; D[o + 3] = size;
    D[o + 4] = col[0]; D[o + 5] = col[1]; D[o + 6] = col[2]; D[o + 7] = a;
    D[o + 8] = data?.[0] ?? 0; D[o + 9] = data?.[1] ?? 0; D[o + 10] = data?.[2] ?? 0; D[o + 11] = data?.[3] ?? 0;
    this.dirty = true;
    return this;
  }

  draw(target: RT, b: Basis, o: DrawOpts = {}) {
    if (this.dirty) {
      this.pass.upload(this.data, this.n);
      this.dirty = false;
    }
    this.pass.draw(target, this.n, { ...camUniforms(b), ...fadeUniforms(o), ...(o.uniforms ?? {}) }, o.blend ?? this.blend);
  }
}
