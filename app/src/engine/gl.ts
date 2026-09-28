import { H, PH, PW, SCALE, W } from './config';
import { GLSL_PALETTE } from './palette';

export let gl: WebGL2RenderingContext;

export function initGL(canvas: HTMLCanvasElement) {
  canvas.width = PW;
  canvas.height = PH;
  const ctx = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!ctx) throw new Error('WebGL2 unavailable');
  gl = ctx;
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
  gl.getExtension('OES_texture_float_linear');
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao); // fullscreen triangle comes from gl_VertexID
  return gl;
}

export function rendererInfo(): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}

/** HDR (RGBA16F) render target, sized in *physical* pixels */
export class RT {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  constructor(public w: number, public h: number, filter: number = WebGL2RenderingContext.LINEAR) {
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

/** render target sized in logical px (allocates SCALE× physical) */
export const makeRT = (w = W, h = H) => new RT(Math.round(w * SCALE), Math.round(h * SCALE));

export function clearRT(target: RT | null, c: [number, number, number] = [0, 0, 0], a = 1) {
  bindTarget(target);
  gl.clearColor(c[0], c[1], c[2], a);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function bindTarget(target: RT | null) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
  gl.viewport(0, 0, target ? target.w : PW, target ? target.h : PH);
}

export const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265359
#define TAU 6.28318530718
uniform vec2 uRes;     // target size, physical px
uniform float uScale;  // SCALE
${GLSL_PALETTE}
// logical px, y down (matches Canvas2D) — only valid for full-frame targets
vec2 fragPx() { return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale * (vec2(${W}.0, ${H}.0) * uScale / uRes); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
vec3 srgb2lin(vec3 c) { return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
vec3 lin2srgb(vec3 c) { c = max(c, 0.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
float sdSegment(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }
// coverage of a line of logical width w at logical distance d (AA in physical px)
float pxLine(float d, float w) { float aa = .75 / uScale; return 1. - smoothstep(w * .5 - aa, w * .5 + aa, abs(d)); }
float pxFill(float d) { float aa = .75 / uScale; return 1. - smoothstep(-aa, aa, d); }
`;

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;

export type UniformValue = number | number[] | RT | WebGLTexture | { tex: WebGLTexture };
export type Blend = 'none' | 'add' | 'over' | 'multiply';

function compile(type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)} ${l}`).join('\n');
    console.error(numbered);
    throw new Error('shader compile failed: ' + log);
  }
  return s;
}

/**
 * Fullscreen fragment pass. `frag` supplies uniforms + main(); it gets vUv (0..1, y up),
 * fragColor, GLSL_COMMON (palette C_*, noise, SDFs, fragPx()) prepended.
 */
export class Pass {
  prog: WebGLProgram;
  private loc = new Map<string, WebGLUniformLocation | null>();
  constructor(frag: string) {
    const src = `#version 300 es\nprecision highp float;\nin vec2 vUv;\nout vec4 fragColor;\n${GLSL_COMMON}\n${frag}`;
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, src));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link failed: ' + gl.getProgramInfoLog(p));
    this.prog = p;
  }
  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, gl.getUniformLocation(this.prog, name));
    return this.loc.get(name)!;
  }
  draw(target: RT | null, uniforms: Record<string, UniformValue> = {}, blend: Blend = 'none') {
    bindTarget(target);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u('uRes'), target ? target.w : PW, target ? target.h : PH);
    gl.uniform1f(this.u('uScale'), SCALE);
    let unit = 0;
    for (const [k, v] of Object.entries(uniforms)) {
      const l = this.u(k);
      if (l === null) continue;
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (Array.isArray(v)) {
        if (v.length === 2) gl.uniform2fv(l, v);
        else if (v.length === 3) gl.uniform3fv(l, v);
        else if (v.length === 4) gl.uniform4fv(l, v);
        else gl.uniform1fv(l, v);
      } else {
        const tex = v instanceof WebGLTexture ? v : (v as { tex: WebGLTexture }).tex;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(l, unit++);
      }
    }
    if (blend === 'none') gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      if (blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
      else if (blend === 'over') gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFunc(gl.DST_COLOR, gl.ZERO);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }
}
