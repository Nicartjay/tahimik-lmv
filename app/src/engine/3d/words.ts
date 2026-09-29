// Kinetic hero words: glyphs rasterised once (Canvas2D, at RASTER px) into a shared
// mip-mapped atlas and drawn as textured quads in 3D, one per glyph, so a word can fly
// past, orbit, tumble apart or be carved into the world. Kerning and tracking come from
// fonts.ts `layout`, so a word at rest reads exactly as the typeface sets it.

import { applyFont, layout, type FontSpec, fontCss } from '../fonts';
import { gl, type RT } from '../gl';
import type { RGB } from '../palette';
import { camUniforms, GLSL_CAM, type Basis } from './camera';
import { fadeUniforms, GeoPass, GLSL_FADE, GLSL_OCCLUDE, type DrawOpts } from './geo';
import { add, cross, madd, mul, norm, type V3 } from './math';

const RASTER = 320;
const PAD = 24;
const SIZE = 4096;

interface Glyph {
  /** atlas uv: left, bottom, right, top */
  uv: [number, number, number, number];
  /** cell size and its offset from the pen (left edge, top above the baseline), raster px */
  w: number;
  h: number;
  left: number;
  top: number;
}

class Atlas {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  tex: WebGLTexture;
  private glyphs = new Map<string, Glyph | null>();
  private x = 0;
  private y = 0;
  private shelf = 0;
  private dirty = false;

  constructor() {
    this.canvas.width = this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }

  /** the glyph for one character in a raster-size font (null for blanks) */
  glyph(ch: string, f: FontSpec): Glyph | null {
    const key = fontCss(f) + '|' + (f.stretch ?? '') + '|' + ch;
    if (this.glyphs.has(key)) return this.glyphs.get(key)!;
    const c = this.ctx;
    applyFont(c, { ...f, tracking: 0 });
    const m = c.measureText(ch);
    const l = Math.ceil(m.actualBoundingBoxLeft), r = Math.ceil(m.actualBoundingBoxRight);
    const a = Math.ceil(m.actualBoundingBoxAscent), d = Math.ceil(m.actualBoundingBoxDescent);
    if (!ch.trim() || l + r <= 0 || a + d <= 0) {
      this.glyphs.set(key, null);
      return null;
    }
    const w = l + r + 2 * PAD, h = a + d + 2 * PAD;
    if (this.x + w > SIZE) {
      this.x = 0;
      this.y += this.shelf;
      this.shelf = 0;
    }
    if (this.y + h > SIZE) throw new Error('word atlas full');
    c.fillStyle = '#fff';
    c.textBaseline = 'alphabetic';
    c.fillText(ch, this.x + PAD + l, this.y + PAD + a);
    const g: Glyph = {
      uv: [this.x / SIZE, (this.y + h) / SIZE, (this.x + w) / SIZE, this.y / SIZE],
      w, h, left: -l - PAD, top: a + PAD,
    };
    this.x += w;
    this.shelf = Math.max(this.shelf, h);
    this.glyphs.set(key, g);
    this.dirty = true;
    return g;
  }

  bind(): WebGLTexture {
    if (this.dirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.dirty = false;
    }
    return this.tex;
  }
}

let atlas: Atlas | null = null;

export interface WordShape {
  text: string;
  /** glyph centres relative to the pen origin on the baseline, raster px, y up */
  glyphs: { g: Glyph; i: number; cx: number; cy: number }[];
  /** advance width, raster px */
  w: number;
}

/** per-glyph motion, returned from WordOpts.each */
export interface GlyphXf {
  off?: V3;
  /** in-plane rotation about the glyph centre, radians */
  spin?: number;
  /** rotation about the glyph's vertical axis (a card turning), radians */
  tilt?: number;
  scale?: number;
  alpha?: number;
  col?: RGB;
}

export interface WordOpts {
  pos: V3;
  right?: V3;
  up?: V3;
  /** world size of the em */
  height: number;
  /** 0 = left, .5 = centred, 1 = right */
  align?: number;
  col: RGB;
  alpha?: number;
  /** i = glyph index in the text, u = glyph centre across the word 0..1 */
  each?: (i: number, u: number) => GlyphXf | void;
}

const ATTRS = [
  { name: 'aP', size: 4 },
  { name: 'aR', size: 4 },
  { name: 'aU', size: 4 },
  { name: 'aUV', size: 4 },
  { name: 'aCol', size: 4 },
];
const STRIDE = 20;

const VERT = /* glsl */ `
in vec4 aP, aR, aU, aUV, aCol;
${GLSL_CAM}
${GLSL_FADE}
out vec2 vUv;
out vec4 vCol;
out float vZ;
void main() {
  vec2 c = vec2(gl_VertexID & 1, gl_VertexID >> 1);
  vec3 p = aP.xyz + aR.xyz * (c.x * 2. - 1.) + aU.xyz * (c.y * 2. - 1.);
  vec3 v = toView(p);
  float f = depthFade(v.z);
  vUv = mix(aUV.xy, aUV.zw, c);
  vCol = vec4(aCol.rgb * aP.w * f, aP.w * f);
  vZ = v.z;
  // true clip coordinates, so the glyph texture is perspective-correct; clipped at uNear
  gl_Position = vec4(v.xy * pxPerUnit(1.) / (uRes * .5), v.z - 2. * uNear, v.z);
}`;

const FRAG = /* glsl */ `
in vec2 vUv;
in vec4 vCol;
in float vZ;
uniform sampler2D uAtlas;
uniform float uAlphaOut;
${GLSL_OCCLUDE}
void main() {
  float a = texture(uAtlas, vUv).a * occlusion(vZ);
  if (a <= 0.) discard;
  fragColor = vec4(vCol.rgb * a, vCol.a * a * uAlphaOut);
}`;

export class Words {
  n = 0;
  private data = new Float32Array(512 * STRIDE);
  private pass = new GeoPass(VERT, FRAG, ATTRS);
  private atlas = (atlas ??= new Atlas());

  /** lay out `text` in font `f` (its size is ignored: glyphs are rasterised at RASTER px) */
  shape(text: string, f: FontSpec): WordShape {
    const rf = { ...f, size: RASTER, tracking: ((f.tracking ?? 0) * RASTER) / f.size };
    const L = layout(text, rf);
    const glyphs: WordShape['glyphs'] = [];
    for (let i = 0; i < text.length; i++) {
      const g = this.atlas.glyph(text[i], rf);
      if (g) glyphs.push({ g, i, cx: L.xs[i] + g.left + g.w / 2, cy: g.top - g.h / 2 });
    }
    return { text, glyphs, w: L.w };
  }

  clear() {
    this.n = 0;
    return this;
  }

  /** one glyph quad: centre, half-extent vectors, uv rect, linear colour × alpha */
  quad(c: V3, hr: V3, hu: V3, uv: Glyph['uv'], col: RGB, alpha: number) {
    if ((this.n + 1) * STRIDE > this.data.length) {
      const d = new Float32Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
    }
    const o = this.n++ * STRIDE, D = this.data;
    D.set(c, o); D[o + 3] = alpha;
    D.set(hr, o + 4); D[o + 7] = 0;
    D.set(hu, o + 8); D[o + 11] = 0;
    D.set(uv, o + 12);
    D.set(col, o + 16); D[o + 19] = 0;
  }

  /** place a shaped word in the world (the baseline-to-cap middle sits on `pos`) */
  word(s: WordShape, o: WordOpts) {
    const R = norm(o.right ?? [1, 0, 0]), U = norm(o.up ?? [0, 1, 0]);
    const N = cross(R, U);
    const k = o.height / RASTER;
    const x0 = (o.align ?? 0.5) * s.w, y0 = 0.36 * RASTER;
    for (const { g, i, cx, cy } of s.glyphs) {
      const x = o.each?.(i, s.w ? cx / s.w : 0.5) || {};
      let r = R, u = U;
      if (x.tilt) {
        const c = Math.cos(x.tilt), sn = Math.sin(x.tilt);
        r = add(mul(r, c), mul(N, sn));
      }
      if (x.spin) {
        const c = Math.cos(x.spin), sn = Math.sin(x.spin);
        [r, u] = [add(mul(r, c), mul(u, sn)), add(mul(u, c), mul(r, -sn))];
      }
      const sc = k * (x.scale ?? 1);
      let p = madd(madd(o.pos, R, (cx - x0) * k), U, (cy - y0) * k);
      if (x.off) p = add(p, x.off);
      const a = (o.alpha ?? 1) * (x.alpha ?? 1);
      if (a > 0) this.quad(p, mul(r, (g.w / 2) * sc), mul(u, (g.h / 2) * sc), g.uv, x.col ?? o.col, a);
    }
    return this;
  }

  draw(target: RT, b: Basis, o: DrawOpts = {}) {
    this.pass.upload(this.data, this.n);
    this.pass.draw(
      target,
      this.n,
      { ...camUniforms(b), ...fadeUniforms(o), uAtlas: this.atlas.bind(), ...(o.uniforms ?? {}) },
      o.blend ?? 'over',
    );
  }
}
