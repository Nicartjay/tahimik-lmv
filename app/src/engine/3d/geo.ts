// Instanced geometry pass: one interleaved float buffer of per-instance attributes, a
// small quad (triangle strip, gl_VertexID 0..3) per instance. It binds its own VAO and
// puts back the empty one the fullscreen passes rely on.

import { PH, PW, SCALE } from '../config';
import { bindTarget, compile, emptyVAO, gl, GLSL_COMMON, GLSL_VCOMMON, setUniforms, type RT, type UniformValue } from '../gl';

export interface Attr {
  name: string;
  /** floats, 1..4 */
  size: number;
}

/** 'add' / 'max' leave the target's alpha alone; 'over' is premultiplied */
export type GeoBlend = 'none' | 'add' | 'over' | 'max';

export class GeoPass {
  prog: WebGLProgram;
  /** floats per instance */
  stride: number;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private cap = 0;
  private loc = new Map<string, WebGLUniformLocation | null>();

  constructor(vert: string, frag: string, attrs: Attr[]) {
    const vs = `#version 300 es\nprecision highp float;\n${GLSL_VCOMMON}\n${vert}`;
    const fs = `#version 300 es\nprecision highp float;\nout vec4 fragColor;\n${GLSL_COMMON}\n${frag}`;
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link failed: ' + gl.getProgramInfoLog(p));
    this.prog = p;
    this.stride = attrs.reduce((s, a) => s + a.size, 0);
    this.vao = gl.createVertexArray()!;
    this.buf = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    let off = 0;
    for (const a of attrs) {
      const l = gl.getAttribLocation(p, a.name);
      if (l >= 0) {
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, a.size, gl.FLOAT, false, this.stride * 4, off * 4);
        gl.vertexAttribDivisor(l, 1);
      }
      off += a.size;
    }
    gl.bindVertexArray(emptyVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** replace the instance buffer with the first n instances of `data` */
  upload(data: Float32Array, n: number) {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const len = n * this.stride;
    if (n > this.cap) {
      this.cap = Math.max(n, this.cap * 2, 256);
      gl.bufferData(gl.ARRAY_BUFFER, this.cap * this.stride * 4, gl.DYNAMIC_DRAW);
    }
    if (len) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, len);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, gl.getUniformLocation(this.prog, name));
    return this.loc.get(name)!;
  }

  draw(target: RT | null, n: number, uniforms: Record<string, UniformValue> = {}, blend: GeoBlend = 'add') {
    if (n <= 0) return;
    bindTarget(target);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u('uRes'), target ? target.w : PW, target ? target.h : PH);
    gl.uniform1f(this.u('uScale'), SCALE);
    gl.uniform1f(this.u('uAlphaOut'), blend === 'over' || blend === 'none' ? 1 : 0);
    setUniforms(uniforms, (k) => this.u(k));
    if (blend === 'none') gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      gl.blendEquation(blend === 'max' ? gl.MAX : gl.FUNC_ADD);
      if (blend === 'over') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFunc(gl.ONE, gl.ONE);
    }
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(emptyVAO);
    gl.blendEquation(gl.FUNC_ADD);
    gl.disable(gl.BLEND);
  }
}

/** view-space fog and near fade shared by lines, points and words (vertex stage) */
export const GLSL_FADE = /* glsl */ `
uniform vec4 uFog; // start, density per unit (0 = off), near-fade length (0 = off), -
float depthFade(float z) {
  float f = uFog.y > 0. ? exp(-max(z - uFog.x, 0.) * uFog.y) : 1.;
  return uFog.z > 0. ? f * smoothstep(uNear, uNear + uFog.z, z) : f;
}`;

/** soft occlusion against a depth RT (view depth in .a, same size as the target) */
export const GLSL_OCCLUDE = /* glsl */ `
uniform sampler2D uDepth; uniform float uUseDepth;
float occlusion(float z) {
  if (uUseDepth < .5) return 1.;
  float d = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).a;
  return 1. - smoothstep(d, d * 1.03 + .02, z);
}`;

export interface DrawOpts {
  /** [start, density]: exponential fog past `start` world units */
  fog?: [number, number];
  /** fade things out as they come within this distance of the near plane */
  nearFade?: number;
  /** occlude against a raymarched view depth (in .a) of the same size as the target */
  depth?: RT;
  blend?: GeoBlend;
  uniforms?: Record<string, UniformValue>;
}

// an active sampler left on a unit that holds the render target is a feedback loop (a GL
// error even if never read), so uDepth always gets a texture: this 1×1 when unused
let blank: WebGLTexture | null = null;
function blankTex() {
  if (blank) return blank;
  blank = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  return blank;
}

export const fadeUniforms = (o: DrawOpts): Record<string, UniformValue> => ({
  uFog: [o.fog?.[0] ?? 0, o.fog?.[1] ?? 0, o.nearFade ?? 0, 0],
  uUseDepth: o.depth ? 1 : 0,
  uDepth: o.depth ?? blankTex(),
});
