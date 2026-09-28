import { H, PH, PW, W } from './config';
import { Pass, RT } from './gl';
import { POST_DEFAULTS, type Post } from './scene';

export type ResolvedPost = typeof POST_DEFAULTS;

export function resolvePost(p: Post | void): ResolvedPost {
  return { ...POST_DEFAULTS, ...(p ?? {}) } as ResolvedPost;
}

export function lerpPost(a: ResolvedPost, b: ResolvedPost, t: number): ResolvedPost {
  const out = { ...b } as Record<string, unknown>;
  for (const k of Object.keys(a) as (keyof ResolvedPost)[]) {
    const va = a[k], vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') out[k] = va + (vb - va) * t;
    else if (Array.isArray(va) && Array.isArray(vb)) out[k] = va.map((x, i) => x + (vb[i] - x) * t);
    else if (k === 'liwanag') out[k] = t < 0.5 ? va : vb;
  }
  return out as ResolvedPost;
}

const PREFILTER = /* glsl */ `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThr, uKnee;
vec3 pre(vec3 c) {
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - uThr + uKnee, 0., 2. * uKnee);
  soft = soft * soft / (4. * uKnee + 1e-4);
  return c * max(soft, b - uThr) / max(b, 1e-4);
}
void main() {
  vec2 o = uTexel;
  vec3 c = pre(texture(uSrc, vUv + vec2(-o.x, -o.y)).rgb) + pre(texture(uSrc, vUv + vec2(o.x, -o.y)).rgb)
         + pre(texture(uSrc, vUv + vec2(-o.x, o.y)).rgb) + pre(texture(uSrc, vUv + vec2(o.x, o.y)).rgb);
  fragColor = vec4(min(c * .25, vec3(64.)), 1.);
}`;

const DOWN = /* glsl */ `
uniform sampler2D uSrc; uniform vec2 uTexel;
void main() {
  vec2 o = uTexel;
  vec3 c = texture(uSrc, vUv).rgb * 4.
    + texture(uSrc, vUv + vec2(-o.x, -o.y)).rgb + texture(uSrc, vUv + vec2(o.x, -o.y)).rgb
    + texture(uSrc, vUv + vec2(-o.x, o.y)).rgb + texture(uSrc, vUv + vec2(o.x, o.y)).rgb;
  fragColor = vec4(c / 8., 1.);
}`;

const UP = /* glsl */ `
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uRadius;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 c = texture(uSrc, vUv).rgb * 4.
    + (texture(uSrc, vUv + vec2(-o.x, 0)).rgb + texture(uSrc, vUv + vec2(o.x, 0)).rgb
     + texture(uSrc, vUv + vec2(0, -o.y)).rgb + texture(uSrc, vUv + vec2(0, o.y)).rgb) * 2.
    + texture(uSrc, vUv + vec2(-o.x, -o.y)).rgb + texture(uSrc, vUv + vec2(o.x, -o.y)).rgb
    + texture(uSrc, vUv + vec2(-o.x, o.y)).rgb + texture(uSrc, vUv + vec2(o.x, o.y)).rgb;
  fragColor = vec4(c / 16., 1.);
}`;

const FINAL = /* glsl */ `
uniform sampler2D uScene, uBloom;
uniform float uExposure, uBloomStr, uGrain, uVignette, uCA, uFade, uFlash, uZoom, uFrame;
uniform vec2 uShake;
vec3 shoulder(vec3 x) {
  const float k = .78;
  return mix(x, k + (1. - k) * (1. - exp(-(x - k) / (1. - k))), step(k, x));
}
void main() {
  vec2 uv = (vUv - .5) / uZoom + .5 + vec2(-uShake.x, uShake.y) / vec2(${W}., ${H}.);
  vec2 d = uv - .5;
  vec3 c;
  if (uCA > 0.) {
    vec2 off = d * uCA * .006;
    c = vec3(texture(uScene, uv + off).r, texture(uScene, uv).g, texture(uScene, uv - off).b);
  } else c = texture(uScene, uv).rgb;
  // bloom with a warm halation tint (the only light that blooms is warm anyway)
  c += texture(uBloom, uv).rgb * uBloomStr * vec3(1., .9, .78) * .22;
  c *= uExposure;
  float r = length(d * vec2(1.35, 1.));
  c *= mix(1., smoothstep(1.05, .2, r), uVignette);
  c = mix(c, C_PAPER, uFlash);
  c *= 1. - uFade;
  vec3 s = lin2srgb(shoulder(c));
  // film grain: triangular noise on a logical-px grid, strongest in the mids
  vec2 px = floor(fragPx());
  float g = hash13(vec3(px, uFrame)) + hash13(vec3(px + 19.7, uFrame * 1.37 + 5.)) - 1.;
  float l = dot(s, vec3(.299, .587, .114));
  s += g * uGrain * (.45 + .55 * (1. - abs(l - .42) * 1.5));
  s += (hash13(vec3(gl_FragCoord.xy, uFrame + 3.)) - .5) / 255.;
  fragColor = vec4(clamp(s, 0., 1.), 1.);
}`;

const ACCUM = /* glsl */ `
uniform sampler2D uSrc; uniform float uW;
void main() { fragColor = vec4(texture(uSrc, vUv).rgb * uW, 1.); }`;

const OVER = /* glsl */ `
uniform sampler2D uTex; uniform float uOpacity;
void main() {
  vec4 c = texture(uTex, vUv);
  vec3 rgb = c.a > 0. ? c.rgb / c.a : vec3(0.);
  fragColor = vec4(srgb2lin(rgb) * c.a * uOpacity, c.a * uOpacity);
}`;

const MIX = /* glsl */ `
uniform sampler2D uA, uB; uniform float uT;
void main() { fragColor = vec4(mix(texture(uA, vUv).rgb, texture(uB, vUv).rgb, uT), 1.); }`;

export class PostFX {
  private chain: RT[] = [];
  private prefilter = new Pass(PREFILTER);
  private down = new Pass(DOWN);
  private up = new Pass(UP);
  private final = new Pass(FINAL);
  accumPass = new Pass(ACCUM);
  overPass = new Pass(OVER);
  mixPass = new Pass(MIX);

  constructor() {
    let w = PW / 2, h = PH / 2;
    for (let i = 0; i < 7; i++) {
      this.chain.push(new RT(Math.max(2, Math.round(w)), Math.max(2, Math.round(h))));
      w /= 2;
      h /= 2;
    }
  }

  run(src: RT, p: ResolvedPost, frame: number) {
    const C = this.chain;
    const texel = (r: RT) => [1 / r.w, 1 / r.h];
    this.prefilter.draw(C[0], { uSrc: src, uTexel: texel(src), uThr: p.bloomThreshold, uKnee: 0.35 });
    for (let i = 1; i < C.length; i++) this.down.draw(C[i], { uSrc: C[i - 1], uTexel: texel(C[i - 1]) });
    for (let i = C.length - 2; i >= 0; i--)
      this.up.draw(C[i], { uSrc: C[i + 1], uTexel: texel(C[i + 1]), uRadius: p.bloomRadius }, 'add');
    this.final.draw(null, {
      uScene: src,
      uBloom: C[0],
      uExposure: p.exposure,
      uBloomStr: p.bloom,
      uGrain: p.grain,
      uVignette: p.vignette,
      uCA: p.ca,
      uFade: p.fade,
      uFlash: p.flash,
      uZoom: p.zoom,
      uFrame: frame % 4096,
      uShake: p.shake,
    });
  }
}
