// Adaptive motion blur (after p(doom)'s sampler; see THIRD_PARTY_NOTICES.md). A frame is
// the average of the scene over a forward shutter [t, t + shutter/FPS], estimated with a
// ternary sequence of centred sample sets, 4 → 12 → 36 → 108 → 324: going from n to 3n
// keeps every old sample (at (m+½)/n) and adds two either side, so each level reuses the
// previous sum. After each level the old and new estimates are compared in display space
// (exposure, flash, fade, tone curve, sRGB), per 2×2 block. Stratified shutter error falls
// about as 1/n, so a change of Δ from n to 3n samples leaves roughly Δ/2 in the 3n estimate
// that is returned: stop when no block anywhere changes by 5 levels of 255 (≈ 2.5 levels
// left, under the film grain). A locked-off frame stops at 12 samples, a handheld one
// usually at 36, and a whip pan runs to its scene's cap.
//
// Cuts must sit on frame boundaries so a shutter never straddles one (the samples never
// reach t + 1/FPS). Post settings (flash, shake, …) come from the first sample, which is
// the same at every level, so the result never depends on where the loop stopped.

import { FPS } from './config';
import { clearRT, floatBlend, gl, makeRT, Pass, RT } from './gl';
import { GLSL_SHOULDER, type ResolvedPost } from './post';

// NaN/Inf from one sub-frame would poison the whole frame: drop them
const ACCUM = /* glsl */ `
uniform sampler2D uSrc; uniform float uW;
void main() {
  vec3 c = texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);
  fragColor = vec4(min(c, vec3(6e4)) * uW, 1.);
}`;

const COMBINE = /* glsl */ `
uniform sampler2D uA, uB; uniform float uWa, uWb;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  fragColor = vec4(texelFetch(uA, p, 0).rgb * uWa + texelFetch(uB, p, 0).rgb * uWb, 1.);
}`;

// per 2×2 block: mean over its pixels of the largest channel change, ×2 into a byte
const ERR = /* glsl */ `
uniform sampler2D uA, uB; uniform float uExposure, uFlash, uFade;
${GLSL_SHOULDER}
vec3 disp(vec3 c) {
  c *= uExposure;
  c = mix(c, C_PAPER, uFlash);
  c *= 1. - uFade;
  return lin2srgb(shoulder(c));
}
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy) * 2, mx = textureSize(uA, 0) - 1;
  float e = 0.;
  for (int j = 0; j < 2; j++)
    for (int i = 0; i < 2; i++) {
      ivec2 p = min(o + ivec2(i, j), mx);
      vec3 d = abs(disp(texelFetch(uA, p, 0).rgb) - disp(texelFetch(uB, p, 0).rgb));
      e += max(d.r, max(d.g, d.b));
    }
  fragColor = vec4(e * .25 * 2., 0., 0., 1.);
}`;

const REDUCE = /* glsl */ `
uniform sampler2D uSrc;
void main() {
  ivec2 o = ivec2(gl_FragCoord.xy) * 16, sz = textureSize(uSrc, 0);
  float m = 0.;
  for (int j = 0; j < 16; j++)
    for (int i = 0; i < 16; i++) {
      ivec2 p = o + ivec2(i, j);
      if (p.x < sz.x && p.y < sz.y) m = max(m, texelFetch(uSrc, p, 0).r);
    }
  fragColor = vec4(m, 0., 0., 1.);
}`;

/** stop once the largest block change is below this byte (= 5 levels, stored ×2) */
const STOP = 10;

export interface SampleResult {
  src: RT;
  post: ResolvedPost;
  samples: number;
}

export class Sampler {
  /** the change measured after each refinement of the last frame (bytes, levels × 2) */
  trace: number[] = [];
  private A: RT[];
  private B: RT;
  private err: RT;
  private red: RT;
  private buf: Uint8Array;
  private accum = new Pass(ACCUM);
  private combine = new Pass(COMBINE);
  private errPass = new Pass(ERR);
  private reduce = new Pass(REDUCE);

  constructor() {
    this.A = [makeRT(), makeRT()];
    const { w, h } = this.A[0];
    this.B = new RT(w, h, gl.NEAREST, floatBlend ? 'rgba32f' : 'rgba16f');
    this.err = new RT(Math.ceil(w / 2), Math.ceil(h / 2), gl.NEAREST, 'rgba8');
    this.red = new RT(Math.ceil(this.err.w / 16), Math.ceil(this.err.h / 16), gl.NEAREST, 'rgba8');
    this.buf = new Uint8Array(this.red.w * this.red.h * 4);
  }

  /**
   * `scene(t)` renders the scene stack at t into `target` and returns its post settings.
   * `cap` bounds the sample count (the first level is min(4, cap) samples).
   */
  run(scene: (t: number) => ResolvedPost, target: RT, t: number, shutter: number, cap: number): SampleResult {
    const at = (u: number) => t + (u * shutter) / FPS;
    let n = Math.max(1, Math.min(4, Math.floor(cap)));
    let post!: ResolvedPost;
    // level 0 straight into B, copied to A
    clearRT(this.B, [0, 0, 0], 1);
    for (let m = 0; m < n; m++) {
      const p = scene(at((m + 0.5) / n));
      if (m === 0) post = p;
      this.accum.draw(this.B, { uSrc: target, uW: 1 / n }, 'add');
    }
    let cur = 0;
    this.trace = [];
    this.combine.draw(this.A[cur], { uA: this.A[1], uB: this.B, uWa: 0, uWb: 1 });
    while (3 * n <= cap) {
      clearRT(this.B, [0, 0, 0], 1);
      const w = 1 / (2 * n);
      for (let m = 0; m < n; m++) {
        for (const k of [0.5, 2.5]) {
          scene(at((3 * m + k) / (3 * n)));
          this.accum.draw(this.B, { uSrc: target, uW: w }, 'add');
        }
      }
      const nxt = 1 - cur;
      this.combine.draw(this.A[nxt], { uA: this.A[cur], uB: this.B, uWa: 1 / 3, uWb: 2 / 3 });
      const worst = this.change(this.A[cur], this.A[nxt], post);
      this.trace.push(worst);
      cur = nxt;
      n *= 3;
      if (worst < STOP) break;
    }
    return { src: this.A[cur], post, samples: n };
  }

  /** largest display-space change between two estimates, as a byte (levels × 2) */
  private change(a: RT, b: RT, p: ResolvedPost): number {
    this.errPass.draw(this.err, { uA: a, uB: b, uExposure: p.exposure, uFlash: p.flash, uFade: p.fade });
    this.reduce.draw(this.red, { uSrc: this.err });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.red.fbo);
    gl.readPixels(0, 0, this.red.w, this.red.h, gl.RGBA, gl.UNSIGNED_BYTE, this.buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let m = 0;
    for (let i = 0; i < this.buf.length; i += 4) if (this.buf[i] > m) m = this.buf[i];
    return m;
  }
}
